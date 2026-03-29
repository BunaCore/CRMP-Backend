import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { eq, and, inArray, ne, isNotNull, desc, asc } from 'drizzle-orm';

@Injectable()
export class ProposalsRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  /**
   * Find all proposals created by a user, sorted by creation date DESC
   */
  async findByCreatedBy(userId: string) {
    return this.drizzle.db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.createdBy, userId))
      .orderBy(desc(schema.proposals.createdAt));
  }

  /**
   * Find proposals in active workflow states
   * Status: Submitted, Under_Review, Partially_Approved (excluding Draft, Needs_Revision, Approved, Rejected)
   */
  async findInProgressProposals() {
    return this.drizzle.db
      .select()
      .from(schema.proposals)
      .where(
        inArray(schema.proposals.currentStatus, [
          'Draft',
          'Under_Review',
          'Needs_Revision',
        ]),
      );
  }

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
   * Find project with department info for a proposal
   * Used to get department context for coordinator approval resolution
   */
  async findProjectWithDepartment(projectId: string) {
    const [project] = await this.drizzle.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.projectId, projectId));

    if (!project || !project.departmentId) {
      return null;
    }

    const [department] = await this.drizzle.db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.id, project.departmentId));

    return {
      projectId: project.projectId,
      departmentId: project.departmentId,
      department,
    };
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
}
