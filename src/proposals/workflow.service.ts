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
import { ProposalApprovalService } from './proposal-approval.service';
import { UsersService } from 'src/users/users.service';
import { ApproverResolution } from './types/proposal';
import { EvaluationContext, BranchCondition } from './types/branch-condition';

type DecisionOutcome = 'Accepted' | 'Rejected' | 'Needs_Revision';

type ProposalRoutingInput = {
  proposalProgram: string;
  budgetAmount: string | number | null;
  degreeLevel: string | null;
};

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
    private readonly approvalService: ProposalApprovalService,
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
        await this.generateApprovalStepsFromRules(tx, proposalId, {
          proposalProgram: proposal.proposalProgram,
          budgetAmount: proposal.budgetAmount,
          degreeLevel: proposal.degreeLevel ?? null,
        });
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
  ): Promise<{ success: boolean; isComplete: boolean }> {
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
  ): Promise<{ success: boolean; isComplete: boolean }> {
    return await this.transitionStep(
      proposalId,
      userId,
      'Needs_Revision',
      'Needs_Revision',
      true,
      comment,
    );
  }

  /**
   * Phase 3: Submit action on active step (VOTE or FORM)
   * VOTE: Track vote, check threshold, auto-advance if met
   * FORM: Store form data, attach files, mark complete
   */
  async submitAction(
    proposalId: string,
    userId: string,
    actionData: {
      action: 'VOTE' | 'SUBMIT'; // VOTE for voting steps, SUBMIT for form steps
      decision?: 'Accepted' | 'Rejected' | 'Needs_Revision'; // For VOTE
      submittedData?: Record<string, any>; // For FORM (field values + fileIds)
      comment?: string;
    },
  ): Promise<{ success: boolean; nextStep?: number; isComplete: boolean }> {
    return await this.drizzle.db.transaction(async (tx) => {
      // 1. Get proposal and active step
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

      // 2. Validate user has the step's approverRole
      const userRoles = await this.usersService.getUserRoles(userId);
      const roleNames = userRoles
        .map((ur) => ur.roleName)
        .filter((r): r is string => r !== null);

      if (!roleNames.includes(activeStep.approverRole)) {
        throw new BadRequestException(
          `User does not have required role: ${activeStep.approverRole}`,
        );
      }

      // 3. Route by step type
      if (activeStep.stepType === 'VOTE') {
        return await this.handleVoteStep(
          tx,
          proposal,
          activeStep,
          userId,
          actionData,
        );
      } else if (activeStep.stepType === 'FORM') {
        return await this.handleFormStep(
          tx,
          proposal,
          activeStep,
          userId,
          actionData,
        );
      } else if (activeStep.stepType === 'APPROVAL') {
        // For APPROVAL, accept means approve, else reject/revise
        if (
          actionData.action === 'VOTE' &&
          actionData.decision === 'Accepted'
        ) {
          return await this.acceptStep(proposalId, userId, actionData.comment);
        } else {
          return await this.rejectStep(proposalId, userId, actionData.comment);
        }
      }

      throw new BadRequestException(
        `Unknown step type: ${activeStep.stepType}`,
      );
    });
  }

  // ============================================================================
  // Phase 3: Vote/Form Handling
  // ============================================================================

  /**
   * Handle VOTE step: Track vote, check threshold, auto-advance if complete
   */
  private async handleVoteStep(
    tx: DB,
    proposal: any,
    activeStep: any,
    userId: string,
    actionData: any,
  ): Promise<{ success: boolean; nextStep?: number; isComplete: boolean }> {
    // 1. Validate user eligible to vote
    const eligibleVoters = await this.getEligibleVotersByRole(
      tx,
      activeStep.approverRole,
    );
    const eligibleVoterIds = eligibleVoters.map((v) => v.id);

    if (!eligibleVoterIds.includes(userId)) {
      throw new BadRequestException(
        'User is not an eligible voter for this step',
      );
    }

    // 2. Track vote in voteJson: { userId: "Accepted" | "Rejected" | "Needs_Revision" }
    const currentVotes = activeStep.voteJson || {};
    currentVotes[userId] = actionData.decision || 'Accepted';

    await tx
      .update(schema.proposalApprovals)
      .set({
        voteJson: currentVotes,
      })
      .where(eq(schema.proposalApprovals.id, activeStep.id));

    // 3. Fetch routing rule to get threshold config
    const routingRule = await tx.query.routingRules.findFirst({
      where: eq(schema.routingRules.id, activeStep.routingRuleId),
    });

    if (!routingRule) {
      throw new InternalServerErrorException('Routing rule not found for step');
    }

    const { voteThreshold, voteThresholdStrategy } = routingRule;

    // 4. Check if threshold is met
    const votesMet = await this.checkVoteThreshold(
      currentVotes,
      eligibleVoterIds.length,
      voteThreshold,
      voteThresholdStrategy,
    );

    if (!votesMet) {
      // Threshold not met yet, just return success
      return { success: true, isComplete: false };
    }

    // 5. Threshold is met - compute final decision
    const approvalsCount = Object.values(currentVotes).filter(
      (d) => d === 'Accepted',
    ).length;
    const rejectionsCount = Object.values(currentVotes).filter(
      (d) => d === 'Rejected',
    ).length;

    let finalDecision: DecisionOutcome = 'Accepted';
    if (rejectionsCount > 0 && voteThresholdStrategy !== 'MAJORITY') {
      // If ALL strategy and any rejections exist, mark as rejected
      finalDecision = 'Rejected';
    } else if (
      voteThresholdStrategy === 'MAJORITY' &&
      rejectionsCount > approvalsCount
    ) {
      // If MAJORITY and more rejections than approvals
      finalDecision = 'Rejected';
    }

    // 6. Mark step complete with final decision
    await tx
      .update(schema.proposalApprovals)
      .set({
        decision: finalDecision as any,
        isActive: false,
        decisionAt: new Date(),
        comment: actionData.comment || null,
      })
      .where(eq(schema.proposalApprovals.id, activeStep.id));

    // 7. Handle advancement or rejection
    if (finalDecision === 'Accepted') {
      // Auto-advance to next pending step
      const nextStep = await tx.query.proposalApprovals.findFirst({
        where: and(
          eq(schema.proposalApprovals.proposalId, proposal.id),
          eq(schema.proposalApprovals.decision, 'Pending' as any),
          eq(schema.proposalApprovals.stepOrder, activeStep.stepOrder + 1),
        ),
      });

      if (!nextStep) {
        // No more steps - mark proposal as approved
        await tx
          .update(schema.proposals)
          .set({
            currentStatus: 'Approved' as any,
            currentStepOrder: 0,
            workspaceUnlocked: true,
          })
          .where(eq(schema.proposals.id, proposal.id));

        await this.createProjectFromApprovedProposal(tx, proposal, userId);

        return { success: true, isComplete: true };
      }

      // Activate next step
      await tx
        .update(schema.proposalApprovals)
        .set({ isActive: true })
        .where(eq(schema.proposalApprovals.id, nextStep.id));

      await tx
        .update(schema.proposals)
        .set({ currentStepOrder: nextStep.stepOrder })
        .where(eq(schema.proposals.id, proposal.id));

      return {
        success: true,
        nextStep: nextStep.stepOrder,
        isComplete: false,
      };
    } else {
      // Rejected - mark proposal for revision
      await tx
        .update(schema.proposals)
        .set({
          currentStatus: 'Needs_Revision' as any,
          isEditable: true,
          currentStepOrder: 0,
        })
        .where(eq(schema.proposals.id, proposal.id));

      return { success: true, isComplete: false };
    }
  }

  /**
   * Handle FORM step: Store form data, attach files, mark complete
   */
  private async handleFormStep(
    tx: DB,
    proposal: any,
    activeStep: any,
    userId: string,
    actionData: any,
  ): Promise<{ success: boolean; nextStep?: number; isComplete: boolean }> {
    // 1. Validate form schema if present (deferred to controller for now)
    const submittedData = actionData.submittedData || {};

    // 2. Store submitted data
    await tx
      .update(schema.proposalApprovals)
      .set({
        submittedJson: submittedData,
      })
      .where(eq(schema.proposalApprovals.id, activeStep.id));

    // 3. Attach any files in the submission
    for (const [fieldName, value] of Object.entries(submittedData)) {
      // Check if value is a UUID (file ID)
      if (typeof value === 'string' && this.isValidUUID(value)) {
        // Validate file exists and belongs to user (if not owned by submitter, reject)
        const file = await tx.query.files.findFirst({
          where: eq(schema.files.id, value),
        });

        if (!file) {
          throw new BadRequestException(
            `File ${value} for field "${fieldName}" not found`,
          );
        }

        if (file.uploadedBy !== userId) {
          throw new BadRequestException(`File ${value} does not belong to you`);
        }

        // Attach file to this step (TEMP → ATTACHED)
        await tx
          .update(schema.files)
          .set({
            resourceType: 'PROPOSAL_STEP',
            resourceId: activeStep.id,
            purpose: fieldName,
            status: 'ATTACHED' as any,
          })
          .where(eq(schema.files.id, value));
      }
    }

    // 4. Mark step as complete (Accepted for approval)
    const finalDecision: DecisionOutcome = actionData.decision || 'Accepted';

    await tx
      .update(schema.proposalApprovals)
      .set({
        decision: finalDecision as any,
        isActive: false,
        decisionAt: new Date(),
        comment: actionData.comment || null,
        approverUserId: userId,
      })
      .where(eq(schema.proposalApprovals.id, activeStep.id));

    // 5. Advance or reject based on action
    if (finalDecision === 'Accepted') {
      const nextStep = await tx.query.proposalApprovals.findFirst({
        where: and(
          eq(schema.proposalApprovals.proposalId, proposal.id),
          eq(schema.proposalApprovals.decision, 'Pending' as any),
          eq(schema.proposalApprovals.stepOrder, activeStep.stepOrder + 1),
        ),
      });

      if (!nextStep) {
        // No more steps - mark proposal as approved
        await tx
          .update(schema.proposals)
          .set({
            currentStatus: 'Approved' as any,
            currentStepOrder: 0,
            workspaceUnlocked: true,
          })
          .where(eq(schema.proposals.id, proposal.id));

        await this.createProjectFromApprovedProposal(tx, proposal, userId);

        return { success: true, isComplete: true };
      }

      // Activate next step
      await tx
        .update(schema.proposalApprovals)
        .set({ isActive: true })
        .where(eq(schema.proposalApprovals.id, nextStep.id));

      await tx
        .update(schema.proposals)
        .set({ currentStepOrder: nextStep.stepOrder })
        .where(eq(schema.proposals.id, proposal.id));

      return {
        success: true,
        nextStep: nextStep.stepOrder,
        isComplete: false,
      };
    } else {
      // Rejection or revision
      await tx
        .update(schema.proposals)
        .set({
          currentStatus:
            actionData.decision === 'Rejected'
              ? ('Rejected' as any)
              : ('Needs_Revision' as any),
          isEditable: true,
          currentStepOrder: 0,
        })
        .where(eq(schema.proposals.id, proposal.id));

      return { success: true, isComplete: false };
    }
  }

  // ============================================================================
  // Vote Helper Methods
  // ============================================================================

  /**
   * Get eligible voters for a step by role
   * Returns all users with the specified role
   */
  private async getEligibleVotersByRole(
    tx: DB,
    approverRole: string,
  ): Promise<any[]> {
    // Get role ID first
    const roleRecord = await tx.query.roles.findFirst({
      where: eq(schema.roles.name, approverRole),
    });

    if (!roleRecord) {
      return [];
    }

    // Get all users with that role
    const voterRoles = await tx.query.userRoles.findMany({
      where: eq(schema.userRoles.roleId, roleRecord.id),
      with: { user: true },
    });

    return voterRoles.map((ur) => ur.user).filter((u) => u != null);
  }

  /**
   * Check if vote threshold is met
   * Returns true if threshold condition is satisfied
   */
  private async checkVoteThreshold(
    currentVotes: Record<string, string>,
    eligibleVoterCount: number,
    voteThreshold: number | null | undefined,
    voteThresholdStrategy: string | null | undefined,
  ): Promise<boolean> {
    const votesCount = Object.keys(currentVotes).length;

    if (voteThresholdStrategy === 'ALL') {
      // All eligible voters must vote
      return votesCount === eligibleVoterCount;
    } else if (voteThresholdStrategy === 'MAJORITY') {
      // Majority of eligible voters must vote
      const majorityThreshold = Math.ceil(eligibleVoterCount / 2);
      return votesCount >= majorityThreshold;
    } else if (voteThresholdStrategy === 'NUMBER') {
      // Specific number of votes required
      return votesCount >= (voteThreshold || 1);
    }

    return false;
  }

  /**
   * Evaluate a branch condition against selected proposal fields.
   * No full proposal object should be passed to this method.
   */
  private evaluateCondition(
    rawCondition: unknown,
    context: EvaluationContext,
  ): boolean {
    const condition = this.parseBranchCondition(rawCondition);
    if (!condition) {
      return false;
    }

    const contextValue = context[condition.field];
    if (contextValue === undefined || contextValue === null) {
      return false;
    }

    if (condition.operator === 'in') {
      if (!Array.isArray(condition.value)) {
        return false;
      }

      return condition.value.some((v) => String(v) === String(contextValue));
    }

    if (condition.operator === 'eq') {
      return String(contextValue) === String(condition.value);
    }

    if (condition.operator === 'neq') {
      return String(contextValue) !== String(condition.value);
    }

    const left = Number(contextValue);
    const right = Number(condition.value);

    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return false;
    }

    if (condition.operator === 'gt') {
      return left > right;
    }

    if (condition.operator === 'gte') {
      return left >= right;
    }

    if (condition.operator === 'lt') {
      return left < right;
    }

    if (condition.operator === 'lte') {
      return left <= right;
    }

    return false;
  }

  /**
   * Safely parse and validate branch condition JSON from routing rule.
   */
  private parseBranchCondition(rawCondition: unknown): BranchCondition | null {
    if (
      !rawCondition ||
      typeof rawCondition !== 'object' ||
      Array.isArray(rawCondition)
    ) {
      return null;
    }

    const candidate = rawCondition as Record<string, unknown>;

    const operator = candidate.operator;
    const field = candidate.field;
    const value = candidate.value;

    const validOperators: BranchCondition['operator'][] = [
      'gt',
      'lt',
      'gte',
      'lte',
      'eq',
      'neq',
      'in',
    ];
    const validFields: (keyof EvaluationContext)[] = [
      'budgetAmount',
      'degreeLevel',
      'proposalProgram',
    ];

    if (
      typeof operator !== 'string' ||
      !validOperators.includes(operator as BranchCondition['operator'])
    ) {
      return null;
    }

    if (
      typeof field !== 'string' ||
      !validFields.includes(field as keyof EvaluationContext)
    ) {
      return null;
    }

    if (
      typeof value !== 'number' &&
      typeof value !== 'string' &&
      !(
        Array.isArray(value) &&
        value.every((v) => typeof v === 'number' || typeof v === 'string')
      )
    ) {
      return null;
    }

    return {
      operator: operator as BranchCondition['operator'],
      field: field as keyof EvaluationContext,
      value,
    };
  }

  /**
   * UUID validation helper
   */
  private isValidUUID(value: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

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
  ): Promise<{ success: boolean; isComplete: boolean }> {
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

      return { success: true, isComplete: false };
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
    const roleNames = userRoles
      .map((ur) => ur.roleName)
      .filter((r): r is string => r !== null);

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

    // COORDINATOR requires department verification
    if (requiredRole === 'COORDINATOR') {
      const proposalCtx =
        await this.approvalService.getProposalWithDepartmentContext(
          proposal.id,
        );

      if (!proposalCtx) {
        return {
          canApprove: false,
          reason: 'Proposal or department not found',
        };
      }

      const isCoord = await this.usersService.isCoordinatorOfDepartment(
        user.id,
        proposalCtx.departmentId,
      );

      if (!isCoord) {
        return {
          canApprove: false,
          reason: `User is not coordinator of department: ${proposalCtx.department?.name || 'unknown'}`,
        };
      }
    }

    return { canApprove: true };
  }

  /**
   * Helper: Generate all approval steps from routing_rules on first submission
   * Copies stepType, voteThreshold, voteThresholdStrategy, dynamicFieldsJson for VOTE and FORM steps
   */
  /**
   * Helper: Generate all approval steps from routing_rules on first submission
   * Evaluates branch conditions and only includes steps that match
   * Copies stepType, voteThreshold, voteThresholdStrategy, dynamicFieldsJson
   * Budget must be pre-calculated; recalculate on resubmit
   */
  private async generateApprovalStepsFromRules(
    tx: DB,
    proposalId: string,
    proposal: ProposalRoutingInput,
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

    // Ensure budgetAmount is calculated
    if (proposal.budgetAmount === null || proposal.budgetAmount === undefined) {
      throw new BadRequestException(
        'Budget amount must be calculated before workflow generation',
      );
    }

    // Create evaluation context with only required fields
    const evaluationContext: EvaluationContext = {
      budgetAmount: parseFloat(String(proposal.budgetAmount)),
      degreeLevel: proposal.degreeLevel || undefined,
      proposalProgram: proposal.proposalProgram,
    };

    // Sort by stepOrder to ensure correct sequence
    const sortedRules = rules.sort((a, b) => a.stepOrder - b.stepOrder);

    // Filter rules: only include steps whose branch condition passes
    const matchingRules = sortedRules.filter((rule) => {
      // If no branch condition, always include (default linear flow)
      if (!rule.branchConditionJson) {
        return true;
      }

      // Evaluate condition against proposal data
      return this.evaluateCondition(
        rule.branchConditionJson,
        evaluationContext,
      );
    });

    if (matchingRules.length === 0) {
      throw new InternalServerErrorException(
        'No workflow steps matched the proposal conditions',
      );
    }

    // Insert only matching steps
    await tx.insert(schema.proposalApprovals).values(
      matchingRules.map((rule) => ({
        proposalId,
        routingRuleId: rule.id,
        stepOrder: rule.stepOrder,
        approverRole: rule.approverRole,
        stepType: rule.stepType,
        dynamicFieldsJson: rule.dynamicFieldsJson || null, // Audit trail: copy form schema
        voteThreshold: rule.voteThreshold || null, // Audit trail: copy vote config
        voteThresholdStrategy: rule.voteThresholdStrategy || null,
        branchKey: rule.branchKey,
        conditionGroup: rule.conditionGroup,
        decision: 'Pending' as any,
        isActive: rule.stepOrder === matchingRules[0].stepOrder, // Activate first step
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

  // ============================================================================
  // Phase 4: Approval Timeline - Frontend-Compatible Timeline View
  // ============================================================================

  /**
   * PUBLIC: Get approval timeline for frontend rendering
   * This is the main entry point; it handles data fetching, then delegates to helpers
   * Fetches proposal, all approvals, and routing rules, then builds enriched timeline
   */
  async getApprovalTimelineForFrontend(
    proposalId: string,
    currentUserId: string,
  ): Promise<any> {
    return await this.drizzle.db.transaction(async (tx) => {
      // 1. Fetch proposal
      const proposal = await tx.query.proposals.findFirst({
        where: eq(schema.proposals.id, proposalId),
      });

      if (!proposal) {
        throw new NotFoundException(`Proposal ${proposalId} not found`);
      }

      // 2. Fetch all approvals for this proposal
      const approvals = await tx.query.proposalApprovals.findMany({
        where: eq(schema.proposalApprovals.proposalId, proposalId),
      });

      // 3. Fetch routing rules for all steps
      const rulesToFetch = approvals
        .map((a) => a.routingRuleId)
        .filter((id) => id != null);

      const rules = await tx.query.routingRules.findMany();
      const routingRuleMap = new Map(
        rules.filter((r) => rulesToFetch.includes(r.id)).map((r) => [r.id, r]),
      );

      // 4. Delegate to buildApprovalTimeline (no DB queries there)
      return await this.buildApprovalTimeline(
        approvals,
        proposal,
        currentUserId,
        routingRuleMap,
      );
    });
  }

  /**
   * PRIVATE: Build approval timeline for frontend display
   * Returns all steps with unified structure:
   * - Top level: canAct, userAction (consistent across all types)
   * - Type-specific: decision/vote/form objects
   *
   * Does NOT query DB directly—accepts pre-fetched approvals and routing rules
   */
  private async buildApprovalTimeline(
    approvals: any[], // All proposalApprovals records for this proposal
    proposal: any, // The proposal record
    currentUserId: string,
    routingRuleMap: Map<string, any>, // Map of routingRuleId -> routingRule
  ): Promise<{
    proposalId: string;
    currentStepOrder: number | null;
    steps: any[]; // ApprovalTimelineStepDto[]
  }> {
    const enrichedSteps = await Promise.all(
      approvals.map(async (approval) => {
        const routingRule = routingRuleMap.get(approval.routingRuleId);
        const stepStatus = this.getStepStatus(approval);
        const canAct = await this.canUserActOnStep(
          approval,
          currentUserId,
          proposal,
        );
        const userAction = this.getUserAction(approval, currentUserId);
        const isFinal = approval.stepOrder === approvals.length;

        // Base step structure (all steps have these)
        const step: any = {
          id: approval.id,
          stepOrder: approval.stepOrder,
          stepLabel: routingRule?.stepLabel || `Step ${approval.stepOrder}`,
          stepType: approval.stepType,
          approverRole: approval.approverRole,
          status: stepStatus,
          isActive: approval.isActive,
          isFinal,
          canAct,
          userAction, // UNIFIED: always present at top level
        };

        // Type-specific data structures
        if (approval.stepType === 'APPROVAL') {
          step.decision = {
            value: approval.decision !== 'Pending' ? approval.decision : null,
            by: approval.approverUserId || undefined,
            at: approval.decisionAt || undefined,
            comment: approval.comment || undefined,
          };
        }

        if (approval.stepType === 'VOTE') {
          step.vote = this.buildVoteData(approval, routingRule);
        }

        if (approval.stepType === 'FORM') {
          step.form = {
            schema:
              approval.dynamicFieldsJson ||
              routingRule?.dynamicFieldsJson ||
              null,
            submission: approval.submittedJson
              ? {
                  submittedBy: approval.approverUserId,
                  submittedAt: approval.decisionAt,
                  values: approval.submittedJson,
                }
              : null,
          };
        }

        return step;
      }),
    );

    return {
      proposalId: proposal.id,
      currentStepOrder: proposal.currentStepOrder,
      steps: enrichedSteps,
    };
  }

  /**
   * Check if user can act on this step
   * Reuses existing resolveApprover() for permission logic
   * Additional checks: step must be active and decision pending
   */
  async canUserActOnStep(
    step: any,
    userId: string,
    proposal: any,
  ): Promise<boolean> {
    // Step must be active and decision still pending
    if (!step.isActive || step.decision !== 'Pending') {
      return false;
    }

    // For VOTE steps: user cannot act if they already voted
    if (step.stepType === 'VOTE') {
      const voteJson = step.voteJson || {};
      if (voteJson[userId]) {
        return false; // Already voted
      }
    }

    // Use existing resolveApprover to check role + dept context
    const user = await this.usersService.findById(userId);
    if (!user) {
      return false;
    }

    const userRoles = await this.usersService.getUserRoles(userId);
    const roleNames = userRoles
      .map((ur) => ur.roleName)
      .filter((r): r is string => r !== null);

    // resolveApprover handles COORDINATOR dept verification
    const resolution = await this.resolveApprover(
      null as any, // Not used in resolveApprover except for context
      user,
      proposal,
      step.approverRole,
      roleNames,
    );

    return resolution.canApprove;
  }

  /**
   * Build vote data structure for VOTE steps (unified format)
   * Returns votes as array + counts for frontend rendering
   */
  private buildVoteData(
    step: any,
    routingRule: any,
  ): {
    threshold: number | null;
    strategy: string | null;
    counts: {
      approved: number;
      rejected: number;
      abstained: number;
      total: number;
    };
    votes: Array<{ userId: string; decision: string }>;
  } {
    const voteJson = step.voteJson || {};

    // Count vote types
    const approvedCount = Object.values(voteJson).filter(
      (v: any) => v === 'Accepted',
    ).length;
    const rejectedCount = Object.values(voteJson).filter(
      (v: any) => v === 'Rejected',
    ).length;
    const abstainedCount = Object.values(voteJson).filter(
      (v: any) => v === 'Needs_Revision',
    ).length;

    // Prefer snapshot from approval (audit trail); fallback to current rule
    const threshold =
      step.voteThreshold !== null
        ? step.voteThreshold
        : routingRule?.voteThreshold;
    const strategy =
      step.voteThresholdStrategy || routingRule?.voteThresholdStrategy;

    return {
      threshold: threshold || null,
      strategy: strategy || null,
      counts: {
        approved: approvedCount,
        rejected: rejectedCount,
        abstained: abstainedCount,
        total: Object.keys(voteJson).length,
      },
      votes: Object.entries(voteJson).map(([userId, decision]) => ({
        userId,
        decision: decision as string,
      })),
    };
  }

  /**
   * Get user's action on this step (if already submitted)
   * UNIFIED across all step types:
   * - APPROVAL: APPROVED | REJECTED | NEEDS_REVISION | null
   * - VOTE: APPROVED | REJECTED | NEEDS_REVISION | null
   * - FORM: SUBMITTED | null
   */
  private getUserAction(
    step: any,
    userId: string,
  ): 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION' | 'SUBMITTED' | null {
    // VOTE step: return their vote if present
    if (step.stepType === 'VOTE') {
      const voteJson = step.voteJson || {};
      if (voteJson[userId]) {
        // Map decision to unified format
        const decision = voteJson[userId];
        if (decision === 'Accepted') return 'APPROVED';
        if (decision === 'Rejected') return 'REJECTED';
        if (decision === 'Needs_Revision') return 'NEEDS_REVISION';
      }
      return null;
    }

    // FORM step: return SUBMITTED if user is the submitter
    if (step.stepType === 'FORM') {
      if (step.approverUserId === userId && step.submittedJson) {
        return 'SUBMITTED';
      }
      return null;
    }

    // APPROVAL step: return unified decision if they acted
    if (step.stepType === 'APPROVAL') {
      if (step.approverUserId === userId && step.decision !== 'Pending') {
        // Map decision enum to unified format
        if (step.decision === 'Accepted') return 'APPROVED';
        if (step.decision === 'Rejected') return 'REJECTED';
        if (step.decision === 'Needs_Revision') return 'NEEDS_REVISION';
      }
      return null;
    }

    return null;
  }

  /**
   * Compute step status from decision + isActive
   * Pure logic: no DB queries
   */
  private getStepStatus(step: any): 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' {
    console.log(step);
    if (step.decision && step.decision !== 'Pending') {
      return 'COMPLETED';
    }

    if (step.isActive) {
      return 'IN_PROGRESS';
    }

    return 'PENDING';
  }
}
