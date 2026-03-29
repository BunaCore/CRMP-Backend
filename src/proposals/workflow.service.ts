import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import { DB } from 'src/db/db.type';
import * as schema from 'src/db/schema';
import { eq, and } from 'drizzle-orm';
import { ProposalsRepository } from './proposals.repository';
import { UsersService } from 'src/users/users.service';
import { ApproverResolution } from './types/proposal';

type DecisionOutcome = 'Accepted' | 'Rejected' | 'Needs_Revision';

/**
 * WorkflowService orchestrates proposal submission, approval steps, and status transitions.
 * Manages approval chains with centralized role validation and deterministic step advancement.
 *
 * Status Flow:
 *   Draft → Under_Review (on submit)
 *   Under_Review → Approved (on final step acceptance)
 *   Under_Review → Rejected (on step rejection)
 *   Under_Review → Needs_Revision (on revision request)
 *   Needs_Revision → Under_Review (on resubmit)
 *   Rejected → Under_Review (on resubmit)
 */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly repository: ProposalsRepository,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Submit proposal to workflow
   * First submission: Generate approval steps from routing_rules, activate first step
   * Resubmit: Resume from the step that was rejected/needs_revision
   */
  async submitProposal(proposalId: string, userId: string): Promise<string> {
    return await this.drizzle.db.transaction(async (tx) => {
      // 1. Fetch and validate proposal
      const { proposal, activeStep } = await this.getProposalWithActiveStep(
        tx,
        proposalId,
      );

      if (!proposal) {
        throw new NotFoundException(`Proposal ${proposalId} not found`);
      }

      if (proposal.createdBy !== userId) {
        throw new BadRequestException(
          'Only proposal creator can submit their proposal',
        );
      }

      // Only allow submission from Draft or Needs_Revision
      if (
        proposal.currentStatus !== 'Draft' &&
        proposal.currentStatus !== 'Needs_Revision'
      ) {
        throw new BadRequestException(
          `Cannot submit proposal in ${proposal.currentStatus} status`,
        );
      }

      const oldStatus = proposal.currentStatus;

      // 2. Generate or resume approval steps
      const existingApprovals = await tx.query.proposalApprovals.findMany({
        where: eq(schema.proposalApprovals.proposalId, proposalId),
      });

      if (existingApprovals.length === 0) {
        // First submission: create all steps from routing_rules
        await this.generateApprovalStepsFromRules(tx, proposalId, proposal);
      } else {
        // Resubmit: resume from the last incomplete step
        await this.resumeWorkflowFromLastIncompleteStep(
          tx,
          proposalId,
          existingApprovals,
        );
      }

      // 3. Transition proposal to Under_Review
      await tx
        .update(schema.proposals)
        .set({
          currentStatus: 'Under_Review' as any,
          isEditable: false,
          currentStepOrder: 1,
          submittedAt: new Date(),
        })
        .where(eq(schema.proposals.id, proposalId));

      // 4. Record status change
      await tx.insert(schema.proposalStatusHistory).values({
        proposalId: proposalId,
        changedBy: userId,
        oldStatus: oldStatus as any,
        newStatus: 'Under_Review' as any,
        note:
          oldStatus === 'Draft'
            ? 'Initial submission'
            : 'Resubmitted after revision request',
        changedAt: new Date(),
      });

      return proposalId;
    });
  }

  /**
   * Accept/approve current step and advance to next pending step
   * If no next step exists, marks proposal as Approved and creates project
   */
  async acceptStep(
    proposalId: string,
    userId: string,
    comment?: string,
  ): Promise<{ success: boolean; nextStep?: number; isComplete: boolean }> {
    return await this.drizzle.db.transaction(async (tx) => {
      // 1. Get proposal and validate active step
      const { proposal, activeStep } = await this.getProposalWithActiveStep(
        tx,
        proposalId,
      );

      if (!proposal) {
        throw new NotFoundException(`Proposal ${proposalId} not found`);
      }

      if (!activeStep) {
        throw new BadRequestException('No active approval step found');
      }

      // 2. Validate user can approve
      await this.validateApproverAuthority(tx, userId, proposal, activeStep);

      // 3. Mark current step as accepted
      await tx
        .update(schema.proposalApprovals)
        .set({
          decision: 'Accepted' as any,
          approverUserId: userId,
          decisionAt: new Date(),
          comment: comment || null,
          isActive: false,
        })
        .where(eq(schema.proposalApprovals.id, activeStep.id));

      // 4. Find next pending step (dynamically, in case of parallel approvals later)
      const nextStep = await tx.query.proposalApprovals.findFirst({
        where: and(
          eq(schema.proposalApprovals.proposalId, proposalId),
          eq(schema.proposalApprovals.decision, 'Pending' as any),
        ),
      });

      // If no next step, workflow is complete
      if (!nextStep) {
        await tx
          .update(schema.proposals)
          .set({
            currentStatus: 'Approved' as any,
            isEditable: false,
            workspaceUnlocked: true,
            currentStepOrder: 0,
          })
          .where(eq(schema.proposals.id, proposalId));

        // Record completion
        await tx.insert(schema.proposalStatusHistory).values({
          proposalId,
          changedBy: userId,
          oldStatus: proposal.currentStatus as any,
          newStatus: 'Approved' as any,
          note: `Final approval by ${activeStep.approverRole}`,
          changedAt: new Date(),
        });

        // Create project and migrate members
        await this.createProjectFromApprovedProposal(tx, proposal, userId);

        return { success: true, isComplete: true };
      }

      // Activate next step
      await tx
        .update(schema.proposalApprovals)
        .set({ isActive: true })
        .where(eq(schema.proposalApprovals.id, nextStep.id));

      // Update proposal's current step
      await tx
        .update(schema.proposals)
        .set({ currentStepOrder: nextStep.stepOrder })
        .where(eq(schema.proposals.id, proposalId));

      // Record step advancement
      await tx.insert(schema.proposalStatusHistory).values({
        proposalId,
        changedBy: userId,
        oldStatus: proposal.currentStatus as any,
        newStatus: proposal.currentStatus as any,
        note: `Step ${activeStep.stepOrder} approved by ${activeStep.approverRole}, advanced to Step ${nextStep.stepOrder}`,
        changedAt: new Date(),
      });

      return {
        success: true,
        nextStep: nextStep.stepOrder,
        isComplete: false,
      };
    });
  }

  /**
   * Reject current step
   * Sets step decision to Rejected and proposal status to Draft for resubmission
   */
  async rejectStep(
    proposalId: string,
    userId: string,
    comment?: string,
  ): Promise<{ success: boolean }> {
    return await this.transitionStep(
      proposalId,
      userId,
      'Rejected',
      'Draft',
      false,
      comment,
    );
  }

  /**
   * Request revision on current step
   * Sets step decision to Needs_Revision and unlocks proposal for editing
   */
  async requestRevision(
    proposalId: string,
    userId: string,
    comment?: string,
  ): Promise<{ success: boolean }> {
    return await this.transitionStep(
      proposalId,
      userId,
      'Needs_Revision',
      'Needs_Revision',
      true,
      comment,
    );
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Helper: Fetch proposal with active approval step
   * Reduces repeated DB queries across methods
   */
  private async getProposalWithActiveStep(
    tx: DB,
    proposalId: string,
  ): Promise<{ proposal: any; activeStep: any }> {
    const proposal = await tx.query.proposals.findFirst({
      where: eq(schema.proposals.id, proposalId),
    });

    const activeStep = proposal
      ? await tx.query.proposalApprovals.findFirst({
          where: and(
            eq(schema.proposalApprovals.proposalId, proposalId),
            eq(schema.proposalApprovals.isActive, true),
          ),
        })
      : null;

    return { proposal, activeStep };
  }

  /**
   * Helper: Unified step transition logic for rejection and revision requests
   * Parameterized by decision outcome, new proposal status, and editability
   */
  private async transitionStep(
    proposalId: string,
    userId: string,
    decision: DecisionOutcome,
    newProposalStatus: string,
    isEditable: boolean,
    comment?: string,
  ): Promise<{ success: boolean }> {
    return await this.drizzle.db.transaction(async (tx) => {
      // 1. Get proposal and validate
      const { proposal, activeStep } = await this.getProposalWithActiveStep(
        tx,
        proposalId,
      );

      if (!proposal) {
        throw new NotFoundException(`Proposal ${proposalId} not found`);
      }

      if (!activeStep) {
        throw new BadRequestException('No active approval step found');
      }

      // 2. Validate user authority
      await this.validateApproverAuthority(tx, userId, proposal, activeStep);

      // 3. Record decision on active step
      await tx
        .update(schema.proposalApprovals)
        .set({
          decision: decision as any,
          approverUserId: userId,
          decisionAt: new Date(),
          comment: comment || null,
          isActive: false,
        })
        .where(eq(schema.proposalApprovals.id, activeStep.id));

      // 4. Deactivate all remaining pending steps
      await tx
        .update(schema.proposalApprovals)
        .set({ isActive: false })
        .where(
          and(
            eq(schema.proposalApprovals.proposalId, proposalId),
            eq(schema.proposalApprovals.decision, 'Pending' as any),
          ),
        );

      // 5. Update proposal status
      await tx
        .update(schema.proposals)
        .set({
          currentStatus: newProposalStatus as any,
          isEditable: isEditable,
          currentStepOrder: 0,
        })
        .where(eq(schema.proposals.id, proposalId));

      // 6. Record status transition
      await tx.insert(schema.proposalStatusHistory).values({
        proposalId,
        changedBy: userId,
        oldStatus: proposal.currentStatus as any,
        newStatus: newProposalStatus as any,
        note: `${decision} by ${activeStep.approverRole} at Step ${activeStep.stepOrder}`,
        changedAt: new Date(),
      });

      return { success: true };
    });
  }

  /**
   * Helper: Validate user has authority to approve at current step
   * Checks role match and department context for COORDINATOR
   */
  private async validateApproverAuthority(
    tx: DB,
    userId: string,
    proposal: any,
    activeStep: any,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);

    const userRoles = await this.usersService.getUserRoles(userId);
    const roleNames = userRoles.map((ur) => ur.roleName);

    const resolution = await this.resolveApprover(
      tx,
      user,
      proposal,
      activeStep.approverRole,
      roleNames,
    );

    if (!resolution.canApprove) {
      throw new BadRequestException(
        resolution.reason || 'User cannot approve this step',
      );
    }
  }

  /**
   * Helper: Check if user's role matches requirement with dept context
   * COORDINATOR must belong to proposal's department; others just need role match
   */
  private async resolveApprover(
    tx: DB,
    user: any,
    proposal: any,
    requiredRole: string,
    userRoles: string[],
  ): Promise<ApproverResolution> {
    if (!userRoles.includes(requiredRole)) {
      return {
        canApprove: false,
        reason: `User does not have required role: ${requiredRole}`,
      };
    }

    // COORDINATOR requires dept verification
    if (requiredRole === 'COORDINATOR') {
      if (!proposal.projectId) {
        return {
          canApprove: false,
          reason: 'Proposal not linked to a project',
        };
      }

      const projectCtx = await this.repository.findProjectWithDepartment(
        proposal.projectId,
      );

      if (!projectCtx) {
        return {
          canApprove: false,
          reason: 'Project or department not found',
        };
      }
      console.log('user:', user);
      const isCoord = await this.usersService.isCoordinatorOfDepartment(
        user.id,
        projectCtx.departmentId,
      );

      if (!isCoord) {
        return {
          canApprove: false,
          reason: `User is not coordinator of department: ${projectCtx.department?.name || 'unknown'}`,
        };
      }
    }

    return { canApprove: true };
  }

  /**
   * Helper: Generate all approval steps from routing_rules on first submission
   */
  private async generateApprovalStepsFromRules(
    tx: DB,
    proposalId: string,
    proposal: any,
  ): Promise<void> {
    const rules = await tx.query.routingRules.findMany({
      where: eq(
        schema.routingRules.proposalProgram,
        proposal.proposalProgram as any,
      ),
    });

    if (!rules || rules.length === 0) {
      throw new InternalServerErrorException(
        `No routing rules found for program: ${proposal.proposalProgram}`,
      );
    }

    // Sort by stepOrder to ensure correct sequence
    const sortedRules = rules.sort((a, b) => a.stepOrder - b.stepOrder);

    await tx.insert(schema.proposalApprovals).values(
      sortedRules.map((rule) => ({
        proposalId,
        routingRuleId: rule.id,
        stepOrder: rule.stepOrder,
        approverRole: rule.approverRole,
        decision: 'Pending' as any,
        isActive: rule.stepOrder === sortedRules[0].stepOrder, // Activate first step
        createdAt: new Date(),
      })),
    );
  }

  /**
   * Helper: Resume workflow by reactivating the step that was rejected/needs_revision
   * Keeps all previous approvals intact for audit trail
   */
  private async resumeWorkflowFromLastIncompleteStep(
    tx: DB,
    proposalId: string,
    existingApprovals: any[],
  ): Promise<void> {
    // Find the step that needs to be redone
    const incompleteStep = existingApprovals.find(
      (a) =>
        a.decision === 'Rejected' ||
        a.decision === 'Needs_Revision' ||
        a.decision === 'Pending',
    );

    if (!incompleteStep) {
      throw new BadRequestException(
        'No incomplete steps found for resubmission',
      );
    }

    // Reset this step's decision to Pending and make it active
    await tx
      .update(schema.proposalApprovals)
      .set({
        decision: 'Pending' as any,
        isActive: true,
        decisionAt: null,
        comment: null,
        approverUserId: null,
      })
      .where(eq(schema.proposalApprovals.id, incompleteStep.id));

    // Deactivate all other steps
    await tx
      .update(schema.proposalApprovals)
      .set({ isActive: false })
      .where(
        and(
          eq(schema.proposalApprovals.proposalId, proposalId),
          eq(schema.proposalApprovals.isActive, true),
        ),
      );
  }

  /**
   * Helper: Create project from approved proposal
   * Migrate proposal_members to project_members and unlock workspace
   */
  private async createProjectFromApprovedProposal(
    tx: DB,
    proposal: any,
    approverUserId: string,
  ): Promise<void> {
    try {
      // 1. Create project
      const [project] = await tx
        .insert(schema.projects)
        .values({
          projectTitle: proposal.title,
          projectDescription: proposal.abstract || '',
          projectProgram: proposal.proposalProgram as any,
          isFunded: proposal.isFunded,
          durationMonths: proposal.durationMonths,
          researchArea: proposal.researchArea,
          projectStage: 'Approved',
          submissionDate: new Date().toDateString(),
          ethicalClearanceStatus: 'Approved' as any,
        })
        .returning();
      // 2. Migrate proposal members to project members
      const proposalMembers = await tx.query.proposalMembers.findMany({
        where: eq(schema.proposalMembers.proposalId, proposal.id),
      });

      if (proposalMembers.length > 0) {
        await tx.insert(schema.projectMembers).values(
          proposalMembers.map((m) => ({
            projectId: project.projectId,
            userId: m.userId,
            role: m.role,
            addedAt: new Date(),
          })),
        );
      }

      // 3. Link project to proposal
      console.log('Linking proposal to project:', proposal.id, project);
      await tx
        .update(schema.proposals)
        .set({ projectId: project.projectId })
        .where(eq(schema.proposals.id, proposal.id));

      // 4. Audit log
      await tx.insert(schema.auditLogs).values({
        actorUserId: approverUserId,
        action: 'CREATED',
        entityType: 'projects',
        entityId: project.projectId,
        metadata: {
          fromProposal: proposal.id,
          title: project.projectTitle,
          membersCount: proposalMembers.length,
        },
      });
    } catch (error) {
      console.error('Failed to create project from proposal:', error);
      throw new InternalServerErrorException(
        'Project creation failed after proposal approval',
      );
    }
  }
}
