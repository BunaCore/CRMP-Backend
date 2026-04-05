import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { eq, and, ne, asc } from 'drizzle-orm';

@Injectable()
export class ProposalApprovalRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  /**
   * Find routing rule for next approver
   * Input: proposalProgram, currentStatus, stepOrder
   * Returns the rule that defines who approves next
   */
  async findRoutingRule(
    proposalProgram: string,
    currentStatus: string,
    stepOrder: number,
  ) {
    const [rule] = await this.drizzle.db
      .select()
      .from(schema.routingRules)
      .where(
        and(
          eq(schema.routingRules.proposalProgram, proposalProgram as any),
          eq(schema.routingRules.currentStatus, currentStatus as any),
          eq(schema.routingRules.stepOrder, stepOrder),
        ),
      );

    return rule || null;
  }

  /**
   * Check if user has already approved a proposal
   * Returns: boolean
   */
  async hasUserAlreadyApproved(
    proposalId: string,
    userId: string,
  ): Promise<boolean> {
    const [record] = await this.drizzle.db
      .select()
      .from(schema.proposalApprovals)
      .where(
        and(
          eq(schema.proposalApprovals.proposalId, proposalId),
          eq(schema.proposalApprovals.approverUserId, userId),
          ne(schema.proposalApprovals.decision, 'Pending'),
        ),
      );

    return !!record;
  }

  /**
   * Find pending approval record for proposal at current step
   * Returns the proposal_approvals entry that hasn't been decided yet
   */
  async findPendingApprovalAtStep(proposalId: string, stepOrder: number) {
    const [approval] = await this.drizzle.db
      .select()
      .from(schema.proposalApprovals)
      .where(
        and(
          eq(schema.proposalApprovals.proposalId, proposalId),
          eq(schema.proposalApprovals.stepOrder, stepOrder),
          eq(schema.proposalApprovals.decision, 'Pending'),
        ),
      );

    return approval || null;
  }

  /**
   * Find FIRST pending approval for a proposal (earliest step)
   * Works for any number of workflow steps
   * Returns the earliest stepOrder where decision is still 'Pending'
   */
  async findFirstPendingApprovalForProposal(proposalId: string) {
    const [approval] = await this.drizzle.db
      .select()
      .from(schema.proposalApprovals)
      .where(
        and(
          eq(schema.proposalApprovals.proposalId, proposalId),
          eq(schema.proposalApprovals.decision, 'Pending'),
        ),
      )
      .orderBy(asc(schema.proposalApprovals.stepOrder))
      .limit(1);

    return approval || null;
  }

  /**
   * Find active pending approval per proposal
   * Aligned with workflow engine: is_active = true AND decision = 'Pending'
   * Returns proposals with their single active step info
   */
  async findProposalsWithActivePendingSteps() {
    return this.drizzle.db
      .select({
        proposal: schema.proposals,
        activeStep: schema.proposalApprovals,
      })
      .from(schema.proposals)
      .innerJoin(
        schema.proposalApprovals,
        and(
          eq(schema.proposalApprovals.proposalId, schema.proposals.id),
          eq(schema.proposalApprovals.isActive, true),
          eq(schema.proposalApprovals.decision, 'Pending'),
        ),
      );
  }

  /**
   * Get active step for proposal
   * Returns single active step or null
   */
  async getActiveStepForProposal(proposalId: string) {
    const [activeStep] = await this.drizzle.db
      .select()
      .from(schema.proposalApprovals)
      .where(
        and(
          eq(schema.proposalApprovals.proposalId, proposalId),
          eq(schema.proposalApprovals.isActive, true),
        ),
      );

    return activeStep || null;
  }

  /**
   * Get all approval steps for a single proposal
   * Returns complete workflow history ordered by stepOrder
   * Used for proposal detail view to show full workflow timeline
   */
  async findApprovalsByProposalId(proposalId: string) {
    return this.drizzle.db
      .select()
      .from(schema.proposalApprovals)
      .where(eq(schema.proposalApprovals.proposalId, proposalId))
      .orderBy(asc(schema.proposalApprovals.stepOrder));
  }

  /**
   * Find proposal with department info
   * Used to get department context for coordinator approval validation
   * Fetches department directly from proposal.departmentId (immutable)
   */
  async findProposalWithDepartment(proposalId: string) {
    const [proposal] = await this.drizzle.db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.id, proposalId));

    if (!proposal || !proposal.departmentId) {
      return null;
    }

    const [department] = await this.drizzle.db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.id, proposal.departmentId));

    return {
      proposalId: proposal.id,
      departmentId: proposal.departmentId,
      department,
    };
  }
}
