import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { eq, and, inArray, ne, isNotNull, desc, asc } from 'drizzle-orm';
import { DB } from 'src/db/db.type';
import { ProposalMemberRole } from './dto/proposal-member.dto';

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
   * Check if a department exists by ID
   * Used to validate departmentId before creating UG/PG proposals
   */
  async departmentExists(departmentId: string): Promise<boolean> {
    const [department] = await this.drizzle.db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.id, departmentId));

    return !!department;
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
   * NEW: Find active pending approval per proposal
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
   * NEW: Get proposals created by user
   */
  async findProposalsByCreator(userId: string) {
    return this.drizzle.db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.createdBy, userId))
      .orderBy(desc(schema.proposals.createdAt));
  }

  /**
   * NEW: Get proposals where user is a member
   */
  async findProposalsByMembership(userId: string) {
    return this.drizzle.db
      .select({
        proposal: schema.proposals,
        membership: schema.proposalMembers,
      })
      .from(schema.proposals)
      .innerJoin(
        schema.proposalMembers,
        and(
          eq(schema.proposalMembers.proposalId, schema.proposals.id),
          eq(schema.proposalMembers.userId, userId),
        ),
      )
      .orderBy(desc(schema.proposals.createdAt));
  }

  /**
   * NEW: Get active step for a proposal
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
   * Create master proposal record
   * Used within a transaction context
   */
  async createProposal(
    tx: any,
    data: {
      createdBy: string;
      title: string;
      abstract?: string;
      proposalProgram: string;
      isFunded: boolean;
      degreeLevel: string;
      researchArea?: string;
      durationMonths?: number;
      departmentId?: string;
    },
  ) {
    const [proposal] = await tx
      .insert(schema.proposals)
      .values({
        ...data,
        currentStatus: 'Draft',
        submittedAt: new Date(),
      })
      .returning();

    return proposal;
  }

  /**
   * Create proposal file record
   */
  async createProposalFile(
    tx: DB,
    data: {
      proposalId: string;
      uploadedBy: string;
      fileName: string;
      filePath: string;
      fileType: string;
      fileSize: number;
    },
  ) {
    const [file] = await tx
      .insert(schema.proposalFiles)
      .values(data)
      .returning();

    return file;
  }

  /**
   * Create proposal version and link to proposal
   */
  async createProposalVersion(
    tx: DB,
    data: {
      proposalId: string;
      createdBy: string;
      fileId: string;
      collaborators?: string[];
    },
  ) {
    const [version] = await tx
      .insert(schema.proposalVersions)
      .values({
        proposalId: data.proposalId,
        createdBy: data.createdBy,
        versionNumber: 1,
        isCurrent: true,
        fileId: data.fileId,
        contentJson: { collaborators: data.collaborators || [] },
        changeSummary: 'Initial Submission',
      })
      .returning();

    // Link version back to proposal
    await tx
      .update(schema.proposals)
      .set({ currentVersionId: version.id })
      .where(eq(schema.proposals.id, data.proposalId));

    return version;
  }

  /**
   * Create budget request and items
   */
  async createBudgetRequest(
    tx: DB,
    data: {
      proposalId: string;
      requestedBy: string;
      items: Array<{ description: string; amount: number }>;
    },
  ) {
    const totalAmount = data.items.reduce(
      (sum, item) => sum + Number(item.amount),
      0,
    );

    const [budgetRequest] = await tx
      .insert(schema.budgetRequests)
      .values({
        proposalId: data.proposalId,
        requestedBy: data.requestedBy,
        currentStatus: 'Draft',
        totalAmount: totalAmount.toString(),
      })
      .returning();

    if (data.items.length > 0) {
      await tx.insert(schema.budgetRequestItems).values(
        data.items.map((item, index) => ({
          budgetRequestId: budgetRequest.id,
          lineIndex: index + 1,
          description: item.description,
          requestedAmount: item.amount.toString(),
        })),
      );
    }

    return budgetRequest;
  }

  /**
   * Get routing rules for a proposal program
   */
  async getRoutingRules(proposalProgram: string) {
    return this.drizzle.db
      .select()
      .from(schema.routingRules)
      .where(eq(schema.routingRules.proposalProgram, proposalProgram as any))
      .orderBy(asc(schema.routingRules.stepOrder));
  }

  /**
   * Create approval steps from routing rules
   */
  async createApprovals(
    tx: DB,
    data: {
      proposalId: string;
      versionId: string;
      approvalsData: Array<{
        routingRuleId: string;
        stepOrder: number;
        approverRole: string;
        isActive: boolean;
        decision: string;
      }>;
    },
  ) {
    if (data.approvalsData.length > 0) {
      await tx.insert(schema.proposalApprovals).values(
        data.approvalsData.map((approval) => ({
          proposalId: data.proposalId,
          routingRuleId: approval.routingRuleId,
          stepOrder: approval.stepOrder,
          approverRole: approval.approverRole,
          decision: approval.decision as any,
          isActive: approval.isActive,
          versionId: data.versionId,
        })),
      );
    }
  }

  /**
   * Create audit log entry
   */
  async createAuditLog(
    tx: DB,
    data: {
      actorUserId: string;
      action:
        | 'CREATED'
        | 'STATUS_CHANGED'
        | 'DECISION_MADE'
        | 'BUDGET_RELEASED'
        | 'WORKSPACE_UNLOCKED'
        | 'EVALUATOR_ASSIGNED';
      entityType: string;
      entityId: string;
      metadata: any;
    },
  ) {
    const [log] = await tx.insert(schema.auditLogs).values(data).returning();

    return log;
  }

  /**
   * Insert proposal members in bulk
   * @param tx Database transaction
   * @param proposalId Proposal ID
   * @param members Array of {userId, role}
   */
  async addProposalMembers(
    tx: DB,
    proposalId: string,
    members: Array<{ userId: string; role: ProposalMemberRole }>,
  ) {
    if (members.length === 0) {
      return [];
    }

    const memberRecords = members.map((m) => ({
      proposalId,
      userId: m.userId,
      role: m.role,
    }));

    return tx.insert(schema.proposalMembers).values(memberRecords).returning();
  }

  /**
   * Find all members of a proposal with user details
   * @param proposalId Proposal ID
   */
  async getProposalMembers(proposalId: string) {
    return this.drizzle.db
      .select({
        id: schema.proposalMembers.id,
        proposalId: schema.proposalMembers.proposalId,
        userId: schema.proposalMembers.userId,
        role: schema.proposalMembers.role,
        addedAt: schema.proposalMembers.addedAt,
        user: {
          id: schema.users.id,
          fullName: schema.users.fullName,
          department: schema.users.department,
          isExternal: schema.users.isExternal,
        },
      })
      .from(schema.proposalMembers)
      .leftJoin(
        schema.users,
        eq(schema.proposalMembers.userId, schema.users.id),
      )
      .where(eq(schema.proposalMembers.proposalId, proposalId));
  }

  /**
   * Validate that users exist in the system
   * @param userIds Array of user IDs to validate
   * @returns Count of found users
   */
  async validateUsersExist(userIds: string[]) {
    const results = await this.drizzle.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(inArray(schema.users.id, userIds));

    return results.map((r) => r.id);
  }

  /**
   * Check if users have specific roles
   * @param userIds User IDs to check
   * @param roleName Role name to filter by
   * @returns User IDs that have the specified role
   */
  async filterUsersByRole(userIds: string[], roleName: string) {
    const results = await this.drizzle.db
      .select({ userId: schema.userRoles.userId })
      .from(schema.userRoles)
      .leftJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(
        and(
          inArray(schema.userRoles.userId, userIds),
          eq(schema.roles.name, roleName),
        ),
      );

    return results.map((r) => r.userId);
  }
}
