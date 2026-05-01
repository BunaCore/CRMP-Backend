import { Injectable, BadRequestException } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import {
  eq,
  and,
  inArray,
  ne,
  isNotNull,
  desc,
  asc,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { evaluationRubrics, evaluationScores } from 'src/db/schema/evaluation';
import { DB } from 'src/db/db.type';
import { ProposalMemberRole } from './dto/proposal-member.dto';
import {
  ProposalRow,
  BudgetRow,
  MemberRow,
  UserRow,
  DepartmentRow,
} from './types/proposal-query';

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
   * Find proposal by ID
   * Used for existence checks
   */
  async findById(proposalId: string) {
    const [proposal] = await this.drizzle.db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.id, proposalId));

    return proposal || null;
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
      budgetAmount?: number;
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

  async findProposalVersionById(versionId: string) {
    const [version] = await this.drizzle.db
      .select()
      .from(schema.proposalVersions)
      .where(eq(schema.proposalVersions.id, versionId));

    return version || null;
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

  /**
   * Remove proposal members by user IDs
   * @param proposalId Proposal ID
   * @param userIds Array of user IDs to remove
   * @returns Count of removed members
   */
  async removeMembersByIds(
    proposalId: string,
    userIds: string[],
  ): Promise<number> {
    if (userIds.length === 0) {
      return 0;
    }

    const result = await this.drizzle.db
      .delete(schema.proposalMembers)
      .where(
        and(
          eq(schema.proposalMembers.proposalId, proposalId),
          inArray(schema.proposalMembers.userId, userIds),
        ),
      );

    return result.rowCount || 0;
  }

  /**
   * Get all members of a proposal with a specific role
   * @param proposalId Proposal ID
   * @param role Role name (e.g., 'ADVISOR', 'EVALUATOR', 'PI', 'MEMBER')
   * @returns Array of user IDs with that role
   */
  async getMembersWithRole(
    proposalId: string,
    role: string,
  ): Promise<string[]> {
    const results = await this.drizzle.db
      .select({ userId: schema.proposalMembers.userId })
      .from(schema.proposalMembers)
      .where(
        and(
          eq(schema.proposalMembers.proposalId, proposalId),
          eq(schema.proposalMembers.role, role as any),
        ),
      );

    return results.map((r) => r.userId);
  }

  /**
   * Clear all members with a specific role from a proposal
   * Used for replacing advisor (one advisor max per proposal)
   * @param proposalId Proposal ID
   * @param role Role to clear
   * @returns Count of removed members
   */
  async clearMembersWithRole(
    proposalId: string,
    role: string,
  ): Promise<number> {
    const result = await this.drizzle.db
      .delete(schema.proposalMembers)
      .where(
        and(
          eq(schema.proposalMembers.proposalId, proposalId),
          eq(schema.proposalMembers.role, role as any),
        ),
      );

    return result.rowCount || 0;
  }

  /**
   * Flexible query to get members by proposal and optional roles filter
   * Returns full member details with user info
   *
   * @param proposalId Proposal ID
   * @param roles Optional array of roles to filter by. If not provided, returns all members.
   * @returns Array of members with user details
   */
  async getMembersByRoles(proposalId: string, roles?: string[]) {
    // Build the where conditions dynamically
    const whereConditions: any[] = [
      eq(schema.proposalMembers.proposalId, proposalId),
    ];

    if (roles && roles.length > 0) {
      whereConditions.push(inArray(schema.proposalMembers.role, roles as any));
    }

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
          email: schema.users.email,
          department: schema.users.department,
          isExternal: schema.users.isExternal,
        },
      })
      .from(schema.proposalMembers)
      .leftJoin(
        schema.users,
        eq(schema.proposalMembers.userId, schema.users.id),
      )
      .where(
        whereConditions.length > 1
          ? and(...whereConditions)
          : whereConditions[0],
      );
  }

  /**
   * Fetch all proposals for list view
   * Returns basic proposal info + budget data (no members)
   * Sorted by creation date DESC
   */
  async getAllProposals() {
    const proposals = await this.drizzle.db
      .select({
        proposal: {
          id: schema.proposals.id,
          title: schema.proposals.title,
          abstract: schema.proposals.abstract,
          currentStatus: schema.proposals.currentStatus,
          submittedAt: schema.proposals.submittedAt,
          isFunded: schema.proposals.isFunded,
          degreeLevel: schema.proposals.degreeLevel,
          researchArea: schema.proposals.researchArea,
          departmentId: schema.proposals.departmentId,
        },
        budget: {
          totalAmount: schema.budgetRequests.totalAmount,
        },
      })
      .from(schema.proposals)
      .leftJoin(
        schema.budgetRequests,
        eq(schema.budgetRequests.proposalId, schema.proposals.id),
      )
      .orderBy(desc(schema.proposals.createdAt));

    // Group by proposal ID to handle multiple budget rows (if any)
    const grouped = new Map<string, any>();
    for (const row of proposals) {
      if (!grouped.has(row.proposal.id)) {
        grouped.set(row.proposal.id, { ...row.proposal, budget: row.budget });
      }
    }

    return Array.from(grouped.values());
  }

  async getProposals(
    where: SQL<unknown> | undefined,
    pagination: { limit: number; offset: number },
  ): Promise<ProposalRow[]> {
    const proposalIdsResult = await this.drizzle.db
      .select({
        id: schema.proposals.id,
      })
      .from(schema.proposals)
      .where(where)
      .orderBy(desc(schema.proposals.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);

    // If no proposals found
    if (proposalIdsResult.length === 0) {
      return [];
    }

    const proposalIds = proposalIdsResult.map((row) => row.id);

    // STEP 2: Fetch all proposal data by IDs (batch query)
    const proposals = await this.drizzle.db
      .select({
        id: schema.proposals.id,
        title: schema.proposals.title,
        abstract: schema.proposals.abstract,
        proposalProgram: schema.proposals.proposalProgram,
        currentStatus: schema.proposals.currentStatus,
        submittedAt: schema.proposals.submittedAt,
        isFunded: schema.proposals.isFunded,
        degreeLevel: schema.proposals.degreeLevel,
        researchArea: schema.proposals.researchArea,
        departmentId: schema.proposals.departmentId,
        createdBy: schema.proposals.createdBy,
      })
      .from(schema.proposals)
      .where(inArray(schema.proposals.id, proposalIds));

    return proposals as ProposalRow[];
  }

  /**
   * Fetch all members for multiple proposals (bulk query)
   * Avoids N+1 by fetching all at once
   *
   * @param proposalIds Array of proposal IDs
   * @returns Members with user details grouped by proposalId
   */
  async getMembersByProposalIds(proposalIds: string[]) {
    if (proposalIds.length === 0) {
      return [];
    }

    return this.drizzle.db
      .select({
        proposalId: schema.proposalMembers.proposalId,
        userId: schema.proposalMembers.userId,
        role: schema.proposalMembers.role,
        addedAt: schema.proposalMembers.addedAt,
        user: {
          id: schema.users.id,
          fullName: schema.users.fullName,
          email: schema.users.email,
          department: schema.users.department,
        },
      })
      .from(schema.proposalMembers)
      .leftJoin(
        schema.users,
        eq(schema.proposalMembers.userId, schema.users.id),
      )
      .where(inArray(schema.proposalMembers.proposalId, proposalIds));
  }

  /**
   * Fetch departments by IDs (bulk)
   *
   * @param departmentIds Array of department IDs
   * @returns Map of department ID → Department
   */
  async getDepartmentsByIds(departmentIds: string[]) {
    if (departmentIds.length === 0) {
      return new Map();
    }

    const departments = await this.drizzle.db
      .select()
      .from(schema.departments)
      .where(inArray(schema.departments.id, departmentIds));

    // Return as map for O(1) lookup
    const deptMap = new Map<string, any>();
    for (const dept of departments) {
      deptMap.set(dept.id, dept);
    }
    return deptMap;
  }

  /**
   * Fetch budget items for a single proposal
   * @param proposalId Proposal ID
   * @returns Array of budget items
   */
  async getBudgetItemsByProposalId(proposalId: string) {
    return this.drizzle.db
      .select({
        id: schema.budgetRequestItems.id,
        description: schema.budgetRequestItems.description,
        amount: schema.budgetRequestItems.requestedAmount,
      })
      .from(schema.budgetRequestItems)
      .innerJoin(
        schema.budgetRequests,
        eq(schema.budgetRequests.id, schema.budgetRequestItems.budgetRequestId),
      )
      .where(eq(schema.budgetRequests.proposalId, proposalId));
  }

  /**
   * Fetch budgets for multiple proposals (bulk query)
   *
   * @param proposalIds Array of proposal IDs
   * @returns Array of budget rows
   */
  async getBudgetsByProposalIds(proposalIds: string[]): Promise<BudgetRow[]> {
    if (proposalIds.length === 0) {
      return [];
    }

    return this.drizzle.db
      .select({
        proposalId: schema.budgetRequests.proposalId,
        totalAmount: schema.budgetRequests.totalAmount,
      })
      .from(schema.budgetRequests)
      .where(inArray(schema.budgetRequests.proposalId, proposalIds)) as Promise<
      BudgetRow[]
    >;
  }

  /**
   * Get all comments for a proposal, ordered by creation date ASC
   * Includes both top-level and threaded comments
   */
  async getCommentsByProposalId(proposalId: string) {
    return this.drizzle.db
      .select({
        id: schema.proposalComments.id,
        proposalId: schema.proposalComments.proposalId,
        commentText: schema.proposalComments.commentText,
        authorId: schema.proposalComments.authorId,
        parentCommentId: schema.proposalComments.parentCommentId,
        isResolved: schema.proposalComments.isResolved,
        createdAt: schema.proposalComments.createdAt,
      })
      .from(schema.proposalComments)
      .where(eq(schema.proposalComments.proposalId, proposalId))
      .orderBy(asc(schema.proposalComments.createdAt));
  }

  /**
   * Get all defence schedules for a proposal, ordered by defenceDate ASC
   * Multiple schedules allowed (rescheduling)
   */
  async getDefencesByProposalId(proposalId: string) {
    return this.drizzle.db
      .select({
        id: schema.proposalDefences.id,
        proposalId: schema.proposalDefences.proposalId,
        scheduledBy: schema.proposalDefences.scheduledBy,
        defenceDate: schema.proposalDefences.defenceDate,
        location: schema.proposalDefences.location,
        note: schema.proposalDefences.note,
        createdAt: schema.proposalDefences.createdAt,
      })
      .from(schema.proposalDefences)
      .where(eq(schema.proposalDefences.proposalId, proposalId))
      .orderBy(asc(schema.proposalDefences.defenceDate));
  }

  /**
   * Fetch all evaluation rubrics (the rule book)
   */
  async getEvaluationRubrics() {
    return this.drizzle.db.select().from(evaluationRubrics);
  }

  /**
   * Fetch all evaluation scores across all rubrics for a single proposal
   */
  async getEvaluationScoresByProposal(proposalId: string) {
    return this.drizzle.db
      .select({
        id: evaluationScores.id,
        rubricId: evaluationScores.rubricId,
        studentId: evaluationScores.studentId,
        evaluatorId: evaluationScores.evaluatorId,
        score: evaluationScores.score,
        feedback: evaluationScores.feedback,
        projectId: evaluationScores.projectId,
        updatedAt: evaluationScores.updatedAt,
      })
      .from(evaluationScores)
      .where(eq(evaluationScores.proposalId, proposalId));
  }

  /**
   * Upsert a student's evaluation score for a specific rubric
   */
  async upsertEvaluationScore(data: {
    rubricId: string;
    proposalId: string;
    projectId?: string;
    studentId: string;
    evaluatorId: string;
    score: string;
    feedback?: string;
  }) {
    // Perform an insert, but on conflict of the unique index (rubric, proposal, student, evaluator), update score
    return this.drizzle.db
      .insert(evaluationScores)
      .values({
        rubricId: data.rubricId,
        proposalId: data.proposalId,
        projectId: data.projectId,
        studentId: data.studentId,
        evaluatorId: data.evaluatorId,
        score: data.score,
        feedback: data.feedback,
      })
      .onConflictDoUpdate({
        target: [
          evaluationScores.rubricId,
          evaluationScores.proposalId,
          evaluationScores.studentId,
        ],
        set: {
          score: data.score,
          feedback: data.feedback,
          projectId: data.projectId,
          evaluatorId: data.evaluatorId,
          updatedAt: new Date(),
        },
      })
      .returning();
  }
}
