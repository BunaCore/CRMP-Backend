import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import { DB } from 'src/db/db.type';
import * as schema from 'src/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { ProposalsRepository } from './proposals.repository';
import { ProposalApprovalService } from './proposal-approval.service';
import { UsersService } from 'src/users/users.service';
import { FilesService } from 'src/common/files/files.service';
import { ApproverResolution } from './types/proposal';
import { EvaluationContext, BranchCondition } from './types/branch-condition';
import { MailService } from 'src/mail/mail.service';
import { EmailType } from 'src/mail/dto/email-type.enum';

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
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly repository: ProposalsRepository,
    private readonly approvalService: ProposalApprovalService,
    private readonly usersService: UsersService,
    private readonly filesService: FilesService,
    private readonly mailService: MailService,
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
        orderBy: asc(schema.proposalApprovals.stepOrder),
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
    const result = await this.drizzle.db.transaction(async (tx) => {
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

      // 4. Phase 3 Refactor: Use centralized advanceWorkflow() for step advancement
      const advancement = await this.advanceWorkflow(tx, proposalId, userId);

      // Fetch updated proposal for email notification
      const updatedProposal = await tx.query.proposals.findFirst({
        where: eq(schema.proposals.id, proposalId),
      });

      return {
        success: true,
        nextStep: advancement.nextStep,
        isComplete: advancement.isComplete,
        proposal: updatedProposal,
      };
    });

    // Send email after transaction
    if (result.isComplete && result.proposal) {
      const creator = await this.usersService.findById(
        result.proposal.createdBy,
      );
      if (creator) {
        this.mailService.sendEmail(
          EmailType.PROPOSAL_STATUS_CHANGED,
          creator.email,
          {
            recipientName: creator.fullName,
            proposalTitle: result.proposal.title,
            status: 'Approved',
          },
        );
      }
    }

    return result;
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
    const result = await this.transitionStep(
      proposalId,
      userId,
      'Rejected',
      'Draft',
      false,
      comment,
    );

    if (result.success) {
      const proposal = await this.repository.findById(proposalId);
      if (proposal) {
        const creator = await this.usersService.findById(proposal.createdBy);
        if (creator) {
          this.mailService.sendEmail(
            EmailType.PROPOSAL_STATUS_CHANGED,
            creator.email,
            {
              recipientName: creator.fullName,
              proposalTitle: proposal.title,
              status: 'Rejected',
            },
          );
        }
      }
    }

    return result;
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
    const result = await this.transitionStep(
      proposalId,
      userId,
      'Needs_Revision',
      'Needs_Revision',
      true,
      comment,
    );

    if (result.success) {
      const proposal = await this.repository.findById(proposalId);
      if (proposal) {
        const creator = await this.usersService.findById(proposal.createdBy);
        if (creator) {
          this.mailService.sendEmail(
            EmailType.PROPOSAL_STATUS_CHANGED,
            creator.email,
            {
              recipientName: creator.fullName,
              proposalTitle: proposal.title,
              status: 'Needs Revision',
            },
          );
        }
      }
    }

    return result;
  }

  /**
   * Unified workflow action entry point
   * Routes to step-specific handlers based on stepType
   * Single transaction encompasses entire workflow step
   * Returns standardized outcome with proposal for notifications
   */
  async submitAction(
    proposalId: string,
    userId: string,
    actionData: {
      decision?: 'Accepted' | 'Rejected' | 'Needs_Revision';
      input?: Record<string, any>; // For FORM: field values + fileIds
      comment?: string;
    },
  ): Promise<{
    success: boolean;
    isComplete: boolean;
    nextStep?: number;
    outcome?: 'Accepted' | 'Rejected';
    proposal?: any;
  }> {
    return await this.drizzle.db.transaction(async (tx) => {
      // 1. Fetch proposal and active step
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

      // 2. Validate user has required role
      const userRoles = await this.usersService.getUserRoles(userId);
      const roleNames = userRoles
        .map((ur) => ur.roleName)
        .filter((r): r is string => r !== null);

      if (!roleNames.includes(activeStep.approverRole)) {
        throw new BadRequestException(
          `User does not have required role: ${activeStep.approverRole}`,
        );
      }

      // 3. Check if user can act on this step
      const canAct = await this.canUserActOnStep(activeStep, userId, proposal);
      if (!canAct) {
        throw new BadRequestException(
          'User cannot act on this step at this time',
        );
      }

      // 4. Route by step type using switch statement
      switch (activeStep.stepType) {
        case 'VOTE':
          return await this.handleVoteStep(
            tx,
            proposal,
            activeStep,
            userId,
            actionData,
          );

        case 'FORM':
          return await this.handleFormStep(
            tx,
            proposal,
            activeStep,
            userId,
            actionData,
          );

        case 'APPROVAL':
          return await this.handleApprovalStep(
            tx,
            proposal,
            activeStep,
            userId,
            actionData,
          );

        default:
          throw new BadRequestException(
            `Unknown step type: ${activeStep.stepType}`,
          );
      }
    });
  }

  // ============================================================================
  // Phase 3: Vote/Form Handling
  // ============================================================================

  /**
   * Handle APPROVAL step: Simple accept/reject/revise decision
   */
  private async handleApprovalStep(
    tx: DB,
    proposal: any,
    activeStep: any,
    userId: string,
    actionData: any,
  ): Promise<{
    success: boolean;
    isComplete: boolean;
    nextStep?: number;
    outcome?: 'Accepted' | 'Rejected';
    proposal?: any;
  }> {
    // 1. Ensure decision is provided
    const decision = actionData.decision;
    if (!decision) throw new BadRequestException('decision must be provided');

    // 2. Mark step with decision
    await tx
      .update(schema.proposalApprovals)
      .set({
        decision: decision as any,
        approverUserId: userId,
        decisionAt: new Date(),
        comment: actionData.comment || null,
        isActive: false,
      })
      .where(eq(schema.proposalApprovals.id, activeStep.id));

    // 3. Route based on decision
    if (decision === 'Accepted') {
      // Fetch updated proposal for response
      const updatedProposal = await tx.query.proposals.findFirst({
        where: eq(schema.proposals.id, proposal.id),
      });

      // Advance workflow
      const advancement = await this.advanceWorkflow(tx, proposal.id, userId);

      return {
        success: true,
        isComplete: advancement.isComplete,
        nextStep: advancement.nextStep,
        outcome: 'Accepted',
        proposal: updatedProposal,
      };
    } else {
      // Rejection or revision request
      await this.handleRejection(tx, proposal, activeStep, userId);

      return {
        success: true,
        isComplete: false,
        outcome: decision,
        proposal,
      };
    }
  }

  /**
   * Handle VOTE step: Track vote, check threshold, auto-advance if complete
   */
  private async handleVoteStep(
    tx: DB,
    proposal: any,
    activeStep: any,
    userId: string,
    actionData: any,
  ): Promise<{
    success: boolean;
    isComplete: boolean;
    nextStep?: number;
    outcome?: 'Accepted' | 'Rejected';
    proposal?: any;
  }> {
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

    // 3. Use vote threshold and strategy copied from routing rule at step creation
    // No need to fetch routing rule - values are in the audit trail snapshot
    const voteThreshold = activeStep.voteThreshold;
    const voteThresholdStrategy = activeStep.voteThresholdStrategy;

    // 4. Check if threshold is met
    const votesMet = await this.checkVoteThreshold(
      currentVotes,
      eligibleVoterIds.length,
      voteThreshold,
      voteThresholdStrategy,
    );

    if (!votesMet) {
      // Threshold not met yet, just return success and wait for more votes
      return {
        success: true,
        isComplete: false,
      };
    }

    // 5. Threshold is met - compute final decision based on votes
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
      rejectionsCount >= approvalsCount
    ) {
      // If MAJORITY and more rejections than approvals (including ties), reject
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

    // 7. Route by final decision outcome
    if (finalDecision === 'Accepted') {
      // Fetch updated proposal
      const updatedProposal = await tx.query.proposals.findFirst({
        where: eq(schema.proposals.id, proposal.id),
      });

      // Advance to next step
      const advancement = await this.advanceWorkflow(tx, proposal.id, userId);

      return {
        success: true,
        isComplete: advancement.isComplete,
        nextStep: advancement.nextStep,
        outcome: 'Accepted',
        proposal: updatedProposal,
      };
    } else {
      // Vote rejected - handle rejection
      await this.handleRejection(tx, proposal, activeStep, userId);

      return {
        success: true,
        isComplete: false,
        outcome: 'Rejected',
        proposal,
      };
    }
  }

  /**
   * Handle FORM step: Validate input, store form data, attach files, mark complete
   */
  private async handleFormStep(
    tx: DB,
    proposal: any,
    activeStep: any,
    userId: string,
    actionData: any,
  ): Promise<{
    success: boolean;
    isComplete: boolean;
    nextStep?: number;
    outcome?: 'Accepted' | 'Rejected';
    proposal?: any;
  }> {
    const submittedData = actionData.input || {};

    // Phase 2 Refactor: Validate form submission against schema
    // This checks required fields, type matching, and file ownership via database query
    await this.validateFormSubmission(
      submittedData,
      activeStep.dynamicFieldsJson,
      userId,
      tx,
    );

    // Store submitted data
    await tx
      .update(schema.proposalApprovals)
      .set({
        submittedJson: submittedData,
      })
      .where(eq(schema.proposalApprovals.id, activeStep.id));

    // Attach files explicitly typed as 'file' in schema
    // Only process fields that the schema defined as file type (no guessing)
    if (activeStep.dynamicFieldsJson?.fields) {
      const fileFields = activeStep.dynamicFieldsJson.fields.filter(
        (f: any) => f.type === 'file',
      );

      for (const field of fileFields) {
        const fileId = submittedData[field.name];
        if (fileId && typeof fileId === 'string') {
          // Attach file to this step (FilesService validates ownership in validateFormSubmission)
          await tx
            .update(schema.files)
            .set({
              resourceType: 'PROPOSAL_APPROVAL_STEP',
              resourceId: activeStep.id,
              purpose: field.name,
              status: 'ATTACHED' as any,
            })
            .where(eq(schema.files.id, fileId));
        }
      }
    }

    // Mark step as complete (Accepted for approval)
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

    // Route by final decision
    if (finalDecision === 'Accepted') {
      // Fetch updated proposal
      const updatedProposal = await tx.query.proposals.findFirst({
        where: eq(schema.proposals.id, proposal.id),
      });

      // Advance to next step
      const advancement = await this.advanceWorkflow(tx, proposal.id, userId);

      return {
        success: true,
        isComplete: advancement.isComplete,
        nextStep: advancement.nextStep,
        outcome: 'Accepted',
        proposal: updatedProposal,
      };
    } else {
      // Form submission rejected
      await this.handleRejection(tx, proposal, activeStep, userId);

      return {
        success: true,
        isComplete: false,
        outcome: 'Rejected',
        proposal,
      };
    }
  }

  /**
   * Handle step rejection outcome
   *
   * Responsibilities:
   * 1. Mark the current step explicitly as 'Rejected' with metadata
   * 2. Deactivate ALL steps (guarantees zero active steps)
   * 3. Update proposal to Needs_Revision for resubmission
   * 4. Record status history for audit
   *
   * Does NOT advance workflow.
   * Guarantees zero active steps after completion.
   */
  private async handleRejection(
    tx: DB,
    proposal: any,
    activeStep: any,
    userId: string,
  ): Promise<void> {
    // 1. Mark current step as rejected with full metadata
    await tx
      .update(schema.proposalApprovals)
      .set({
        decision: 'Rejected' as any,
        isActive: false,
        decisionAt: new Date(),
        approverUserId: userId,
        // Keep existing comment from actionData (already set by caller)
      })
      .where(eq(schema.proposalApprovals.id, activeStep.id));

    // 2. Deactivate ALL steps (ensures zero active steps, not just pending)
    await tx
      .update(schema.proposalApprovals)
      .set({ isActive: false })
      .where(eq(schema.proposalApprovals.proposalId, proposal.id));

    // 3. Mark proposal for revision
    await tx
      .update(schema.proposals)
      .set({
        currentStatus: 'Needs_Revision' as any,
        isEditable: true,
        currentStepOrder: 0,
      })
      .where(eq(schema.proposals.id, proposal.id));

    // 4. Record status transition in history
    await tx.insert(schema.proposalStatusHistory).values({
      proposalId: proposal.id,
      changedBy: userId,
      oldStatus: proposal.currentStatus as any,
      newStatus: 'Needs_Revision' as any,
      note: `Rejected by ${activeStep.approverRole} at Step ${activeStep.stepOrder}`,
      changedAt: new Date(),
    });
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
    if (!voteThreshold)
      throw new InternalServerErrorException(
        'Vote threshold not defined for this step',
      );
    return votesCount >= voteThreshold;
    //TODO: the vote threshold strategy is not fully defined for now just check if we met the threshold
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
        stepLabel: rule.stepLabel || null, // Audit trail: copy step label
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
   *
   * Guarantees exactly ONE active step after resumption.
   * Selects the latest rejected/needs_revision step (highest stepOrder).
   * Keeps all previous approvals intact for audit trail.
   */
  private async resumeWorkflowFromLastIncompleteStep(
    tx: DB,
    proposalId: string,
    existingApprovals: any[],
  ): Promise<void> {
    // Find the LATEST rejected or needs_revision step (highest stepOrder)
    const incompleteStep = existingApprovals
      .filter(
        (a) => a.decision === 'Rejected' || a.decision === 'Needs_Revision',
      )
      .sort((a, b) => b.stepOrder - a.stepOrder)[0];

    if (!incompleteStep) {
      throw new BadRequestException(
        'No incomplete steps found for resubmission',
      );
    }

    // 1. Deactivate ALL steps first (ensures no accidental active steps remain)
    await tx
      .update(schema.proposalApprovals)
      .set({ isActive: false })
      .where(eq(schema.proposalApprovals.proposalId, proposalId));

    // 2. Reset the target step to Pending and activate it
    await tx
      .update(schema.proposalApprovals)
      .set({
        decision: 'Pending' as any,
        isActive: true,
        decisionAt: null,
        comment: null,
        approverUserId: null,
        voteJson: null, // Reset any partial votes from previous attempt
      })
      .where(eq(schema.proposalApprovals.id, incompleteStep.id));
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
      this.logger.log(
        {
          proposalId: proposal.id,
          projectId: project.projectId,
        },
        'Linking proposal to project',
      );
      await tx
        .update(schema.proposals)
        .set({ projectId: project.projectId })
        .where(eq(schema.proposals.id, proposal.id));

      // 4. Create default workspace
      const [workspace] = await tx
        .insert(schema.workspaces)
        .values({
          projectId: project.projectId,
          name: 'Default Workspace',
          createdBy: approverUserId,
        })
        .returning();

      // 5. Create initial document
      const initialContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Start writing your document here...' },
            ],
          },
        ],
      };
      const [document] = await tx
        .insert(schema.documents)
        .values({
          workspaceId: workspace.id,
          currentContent: initialContent,
        })
        .returning();

      // 6. Create initial version
      const [version] = await tx
        .insert(schema.documentVersions)
        .values({
          documentId: document.id,
          content: initialContent,
          createdBy: approverUserId,
          versionNumber: 1,
        })
        .returning();

      // 7. Update document with current version
      await tx
        .update(schema.documents)
        .set({ currentVersionId: version.id })
        .where(eq(schema.documents.id, document.id));

      // 8. Audit log
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
      this.logger.error(
        {
          err: error,
          proposalId: proposal?.id,
        },
        'Failed to create project from proposal',
      );
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

      // 2. Fetch all approvals for this proposal sorted by step order
      const approvals = await tx.query.proposalApprovals.findMany({
        where: eq(schema.proposalApprovals.proposalId, proposalId),
        orderBy: asc(schema.proposalApprovals.stepOrder), // Sort by step order for correct timeline sequence
      });

      // 3. Delegate to buildApprovalTimeline (no DB queries needed)
      // All metadata is already copied into approvals at step creation time
      return await this.buildApprovalTimeline(
        approvals,
        proposal,
        currentUserId,
      );
    });
  }

  /**
   * PRIVATE: Build approval timeline for frontend display
   * Returns all steps with unified structure:
   * - Top level: canAct, userAction (consistent across all types)
   * - Type-specific: decision/vote/form objects
   *
   * All metadata is pre-copied into approvals at step creation time (stepLabel, voteThreshold, etc.)
   * No additional DB queries needed here
   */
  private async buildApprovalTimeline(
    approvals: any[], // All proposalApprovals records for this proposal (with copied metadata)
    proposal: any, // The proposal record
    currentUserId: string,
  ): Promise<{
    proposalId: string;
    currentStepOrder: number | null;
    steps: any[]; // ApprovalTimelineStepDto[]
  }> {
    const enrichedSteps = await Promise.all(
      approvals.map(async (approval) => {
        const stepStatus = this.getStepStatus(approval);
        const canAct = await this.canUserActOnStep(
          approval,
          currentUserId,
          proposal,
        );
        const userAction = this.getUserAction(approval, currentUserId);
        // Since approvals are sorted by stepOrder, last item is the final step
        const isFinal =
          approval.stepOrder === approvals[approvals.length - 1].stepOrder;

        // Base step structure (all steps have these)
        const step: any = {
          id: approval.id,
          stepOrder: approval.stepOrder,
          stepLabel: approval.stepLabel || `Step ${approval.stepOrder}`, // Use copied label
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
          step.vote = this.buildVoteData(approval);
        }

        if (approval.stepType === 'FORM') {
          step.form = {
            schema: approval.dynamicFieldsJson || null, // Use copied schema
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
   * Uses threshold + strategy copied from routing rule during step creation
   */
  private buildVoteData(step: any): {
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

    // Use copied snapshot from approval (audit trail)
    const threshold = step.voteThreshold || null;
    const strategy = step.voteThresholdStrategy || null;

    return {
      threshold,
      strategy,
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
    if (step.decision && step.decision !== 'Pending') {
      return 'COMPLETED';
    }

    if (step.isActive) {
      return 'IN_PROGRESS';
    }

    return 'PENDING';
  }

  // ============================================================================
  // Phase 1 Refactor: Form Validation & Centralized Advancement
  // ============================================================================

  /**
   * Validate form submission against schema
   * Checks:
   * - Required fields present
   * - Type matching (especially files)
   * - File ownership via database query
   * - No extra fields (data pollution prevention)
   *
   * Throws BadRequestException on validation failure
   */
  private async validateFormSubmission(
    submittedData: Record<string, any>,
    dynamicFieldsJson: any,
    userId: string,
    tx?: DB,
  ): Promise<void> {
    if (!dynamicFieldsJson || !dynamicFieldsJson.fields) {
      throw new BadRequestException('Form schema not defined for this step');
    }

    const schemaFields = dynamicFieldsJson.fields as Array<{
      name: string;
      type: string;
      required?: boolean;
    }>;

    // Create set of valid field names from schema
    const validFieldNames = new Set(schemaFields.map((f) => f.name));

    // Check for extra fields (data pollution prevention)
    for (const fieldName of Object.keys(submittedData)) {
      if (!validFieldNames.has(fieldName)) {
        throw new BadRequestException(
          `Unknown field "${fieldName}" not in form schema`,
        );
      }
    }

    // Validate each field
    for (const schemaField of schemaFields) {
      const value = submittedData[schemaField.name];

      // Check required
      if (
        schemaField.required &&
        (value === undefined || value === null || value === '')
      ) {
        throw new BadRequestException(
          `Required field "${schemaField.name}" is missing`,
        );
      }

      // Skip optional fields that are empty
      if (
        !schemaField.required &&
        (value === undefined || value === null || value === '')
      ) {
        continue;
      }

      // Type-specific validation
      if (schemaField.type === 'file') {
        if (typeof value !== 'string' || !this.isValidUUID(value)) {
          throw new BadRequestException(
            `Field "${schemaField.name}" must be a valid file UUID`,
          );
        }

        // Query file metadata (use transaction if provided, otherwise use main DB)
        const db = tx || this.drizzle.db;
        const file = await db.query.files.findFirst({
          where: eq(schema.files.id, value),
        });

        if (!file) {
          throw new BadRequestException(
            `File for field "${schemaField.name}" not found`,
          );
        }

        if (file.uploadedBy !== userId) {
          throw new BadRequestException(
            `File for field "${schemaField.name}" does not belong to you`,
          );
        }
      }
      // Add more type validations as needed (text, number, etc.)
    }
  }

  /**
   * Centralized workflow advancement
   * Called after a step is completed (approved/form submitted/vote threshold met)
   * - Finds next Pending step
   * - If exists: activates and returns nextStep
   * - If not: completes workflow and returns isComplete: true
   * Eliminates duplication in acceptStep, handleVoteStep, handleFormStep
   */
  private async advanceWorkflow(
    tx: DB,
    proposalId: string,
    userId: string,
  ): Promise<{ nextStep?: number; isComplete: boolean }> {
    const nextStep = await tx.query.proposalApprovals.findFirst({
      where: and(
        eq(schema.proposalApprovals.proposalId, proposalId),
        eq(schema.proposalApprovals.decision, 'Pending' as any),
      ),
      orderBy: asc(schema.proposalApprovals.stepOrder),
    });

    if (!nextStep) {
      // No more steps - complete workflow
      return await this.completeWorkflow(tx, proposalId, userId);
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

    return {
      nextStep: nextStep.stepOrder,
      isComplete: false,
    };
  }

  /**
   * Complete workflow: mark proposal as Approved and create project
   * Called by advanceWorkflow when no more steps remain
   */
  private async completeWorkflow(
    tx: DB,
    proposalId: string,
    userId: string,
  ): Promise<{ isComplete: true }> {
    // Fetch proposal for project creation
    const proposal = await tx.query.proposals.findFirst({
      where: eq(schema.proposals.id, proposalId),
    });

    if (!proposal) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }

    // Mark proposal as approved
    await tx
      .update(schema.proposals)
      .set({
        currentStatus: 'Approved' as any,
        isEditable: false,
        workspaceUnlocked: true,
        currentStepOrder: 0,
      })
      .where(eq(schema.proposals.id, proposalId));

    // Record status change
    await tx.insert(schema.proposalStatusHistory).values({
      proposalId,
      changedBy: userId,
      oldStatus: proposal.currentStatus as any,
      newStatus: 'Approved' as any,
      note: 'Final approval. Workflow complete.',
      changedAt: new Date(),
    });

    // Create project
    await this.createProjectFromApprovedProposal(tx, proposal, userId);

    return { isComplete: true };
  }
}
