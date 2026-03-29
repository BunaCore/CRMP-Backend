import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { and, eq, ilike, or } from 'drizzle-orm';

/**
 * UndergradRepository
 *
 * SINGLE RESPONSIBILITY: All DB queries for the UG coordinator flow live here.
 * No business logic — just raw data access.
 *
 * REUSABILITY: This repository is exported from UndergradModule so any other
 * future module (e.g., ReportsModule, PgModule) can inject it instead of
 * duplicating these queries.
 */
@Injectable()
export class UndergradRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // LIST: All UG proposals with joined researcher info, approval row, budget
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fetch all Undergraduate proposals.
   * Relationships resolved:
   *   proposals → users (researcher)
   *   proposals → proposal_approvals (coordinator step)
   *   proposals → budget_requests (total amount)
   *   proposals → proposal_versions → proposal_files (current file)
   *
   * Filters (all optional):
   *   status  — matches proposals.current_status
   *   search  — case-insensitive match on proposal title OR researcher name
   */
  async findAllUGProposals(filters: { status?: string; search?: string }) {
    const rows = await this.drizzle.db
      .select({
        // ── Core proposal fields ──────────────────────────────────
        id: schema.proposals.id,
        title: schema.proposals.title,
        abstract: schema.proposals.abstract,
        proposalProgram: schema.proposals.proposalProgram,
        isFunded: schema.proposals.isFunded,
        degreeLevel: schema.proposals.degreeLevel,
        researchArea: schema.proposals.researchArea,
        durationMonths: schema.proposals.durationMonths,
        currentStatus: schema.proposals.currentStatus,
        submittedAt: schema.proposals.submittedAt,
        workspaceUnlocked: schema.proposals.workspaceUnlocked,
        workspaceUnlockedAt: schema.proposals.workspaceUnlockedAt,
        createdAt: schema.proposals.createdAt,
        // ── Researcher (who submitted) ────────────────────────────
        researcherId: schema.users.id,
        researcherName: schema.users.fullName,
        researcherEmail: schema.users.email,
        researcherDepartment: schema.users.department,
        // ── Coordinator approval row ──────────────────────────────
        approvalId: schema.proposalApprovals.id,
        approvalDecision: schema.proposalApprovals.decision,
        approvalComment: schema.proposalApprovals.comment,
        approvalDecisionAt: schema.proposalApprovals.decisionAt,
        approverUserId: schema.proposalApprovals.approverUserId,
        // ── Budget summary ────────────────────────────────────────
        totalBudget: schema.budgetRequests.totalAmount,
      })
      .from(schema.proposals)
      // Researcher
      .innerJoin(schema.users, eq(schema.users.id, schema.proposals.createdBy))
      // Coordinator approval row (step_order = 1 for UG)
      .leftJoin(
        schema.proposalApprovals,
        and(
          eq(schema.proposalApprovals.proposalId, schema.proposals.id),
          eq(schema.proposalApprovals.approverRole, 'COORDINATOR'),
        ),
      )
      // Budget header
      .leftJoin(
        schema.budgetRequests,
        eq(schema.budgetRequests.proposalId, schema.proposals.id),
      )
      // Only UG proposals reach this coordinator
      .where(
        and(
          eq(schema.proposals.proposalProgram, 'UG'),
          // Optional status filter
          filters.status
            ? eq(schema.proposals.currentStatus, filters.status as any)
            : undefined,
          // Optional search: title OR researcher name (case-insensitive)
          filters.search
            ? or(
                ilike(schema.proposals.title, `%${filters.search}%`),
                ilike(schema.users.fullName, `%${filters.search}%`),
              )
            : undefined,
        ),
      )
      .orderBy(schema.proposals.submittedAt);

    return rows;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DETAIL: Full Level-3 view of a single proposal
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fetch complete detail for one UG proposal.
   * Level 3 means: core + budget items + file info + status history +
   *                all approval steps + assigned advisors
   */
  async findOneUGProposal(proposalId: string) {
    // ── A. Core proposal + researcher ─────────────────────────────────
    const [core] = await this.drizzle.db
      .select({
        id: schema.proposals.id,
        title: schema.proposals.title,
        abstract: schema.proposals.abstract,
        proposalProgram: schema.proposals.proposalProgram,
        isFunded: schema.proposals.isFunded,
        degreeLevel: schema.proposals.degreeLevel,
        researchArea: schema.proposals.researchArea,
        durationMonths: schema.proposals.durationMonths,
        currentStatus: schema.proposals.currentStatus,
        submittedAt: schema.proposals.submittedAt,
        workspaceUnlocked: schema.proposals.workspaceUnlocked,
        workspaceUnlockedAt: schema.proposals.workspaceUnlockedAt,
        createdAt: schema.proposals.createdAt,
        updatedAt: schema.proposals.updatedAt,
        currentVersionId: schema.proposals.currentVersionId,
        // Researcher
        researcherId: schema.users.id,
        researcherName: schema.users.fullName,
        researcherEmail: schema.users.email,
        researcherDepartment: schema.users.department,
        researcherUniversityId: schema.users.universityId,
      })
      .from(schema.proposals)
      .innerJoin(schema.users, eq(schema.users.id, schema.proposals.createdBy))
      .where(
        and(
          eq(schema.proposals.id, proposalId),
          eq(schema.proposals.proposalProgram, 'UG'),
        ),
      );

    if (!core) return null; // not found or not UG

    // ── B. Current file (via current_version_id → proposal_versions → proposal_files) ──
    const fileRows = await this.drizzle.db
      .select({
        fileId: schema.proposalFiles.id,
        fileName: schema.proposalFiles.fileName,
        filePath: schema.proposalFiles.filePath,
        fileType: schema.proposalFiles.fileType,
        fileSize: schema.proposalFiles.fileSize,
        uploadedAt: schema.proposalFiles.createdAt,
        versionNumber: schema.proposalVersions.versionNumber,
        isCurrent: schema.proposalVersions.isCurrent,
        changeSummary: schema.proposalVersions.changeSummary,
      })
      .from(schema.proposalVersions)
      .leftJoin(
        schema.proposalFiles,
        eq(schema.proposalFiles.id, schema.proposalVersions.fileId),
      )
      .where(eq(schema.proposalVersions.proposalId, proposalId))
      .orderBy(schema.proposalVersions.versionNumber);

    // ── C. Budget — header + line items ───────────────────────────────
    const [budgetHeader] = await this.drizzle.db
      .select()
      .from(schema.budgetRequests)
      .where(eq(schema.budgetRequests.proposalId, proposalId));

    const budgetItems = budgetHeader
      ? await this.drizzle.db
          .select()
          .from(schema.budgetRequestItems)
          .where(eq(schema.budgetRequestItems.budgetRequestId, budgetHeader.id))
          .orderBy(schema.budgetRequestItems.lineIndex)
      : [];

    // ── D. Status history (append-only audit trail) ───────────────────
    const statusHistory = await this.drizzle.db
      .select({
        id: schema.proposalStatusHistory.id,
        oldStatus: schema.proposalStatusHistory.oldStatus,
        newStatus: schema.proposalStatusHistory.newStatus,
        changedAt: schema.proposalStatusHistory.changedAt,
        note: schema.proposalStatusHistory.note,
        changedByName: schema.users.fullName,
      })
      .from(schema.proposalStatusHistory)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.proposalStatusHistory.changedBy),
      )
      .where(eq(schema.proposalStatusHistory.proposalId, proposalId))
      .orderBy(schema.proposalStatusHistory.changedAt);

    // ── E. All approval steps (the full routing chain for this proposal) ─
    const approvalSteps = await this.drizzle.db
      .select({
        id: schema.proposalApprovals.id,
        stepOrder: schema.proposalApprovals.stepOrder,
        approverRole: schema.proposalApprovals.approverRole,
        decision: schema.proposalApprovals.decision,
        comment: schema.proposalApprovals.comment,
        decisionAt: schema.proposalApprovals.decisionAt,
        approverName: schema.users.fullName,
        approverEmail: schema.users.email,
      })
      .from(schema.proposalApprovals)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.proposalApprovals.approverUserId),
      )
      .where(eq(schema.proposalApprovals.proposalId, proposalId))
      .orderBy(schema.proposalApprovals.stepOrder);

    // ── F. Assigned advisors (evaluator_assignments) ──────────────────
    const assignedAdvisors = await this.drizzle.db
      .select({
        assignmentId: schema.evaluatorAssignments.id,
        assignedAt: schema.evaluatorAssignments.assignedAt,
        dueDate: schema.evaluatorAssignments.dueDate,
        advisorId: schema.users.id,
        advisorName: schema.users.fullName,
        advisorEmail: schema.users.email,
        advisorDepartment: schema.users.department,
      })
      .from(schema.evaluatorAssignments)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.evaluatorAssignments.evaluatorUserId),
      )
      .where(eq(schema.evaluatorAssignments.proposalId, proposalId));

    // ── Assemble and return ───────────────────────────────────────────
    return {
      ...core,
      versions: fileRows,
      budget: {
        header: budgetHeader ?? null,
        items: budgetItems,
      },
      statusHistory,
      approvalSteps,
      assignedAdvisors,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DECISION: Queries used by makeDecision service method
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find the coordinator's Pending approval row for a proposal.
   * Returns null if no pending row exists (already decided or wrong type).
   */
  async findPendingCoordinatorApproval(proposalId: string) {
    const [row] = await this.drizzle.db
      .select()
      .from(schema.proposalApprovals)
      .where(
        and(
          eq(schema.proposalApprovals.proposalId, proposalId),
          eq(schema.proposalApprovals.approverRole, 'COORDINATOR'),
          eq(schema.proposalApprovals.decision, 'Pending'),
        ),
      );
    return row ?? null;
  }

  /**
   * Find the basic proposal row (to get current status for history).
   * Returns null if proposal doesn't exist or isn't UG.
   */
  async findUGProposalBasic(proposalId: string) {
    const [row] = await this.drizzle.db
      .select({
        id: schema.proposals.id,
        title: schema.proposals.title,
        currentStatus: schema.proposals.currentStatus,
        createdBy: schema.proposals.createdBy,
      })
      .from(schema.proposals)
      .where(
        and(
          eq(schema.proposals.id, proposalId),
          eq(schema.proposals.proposalProgram, 'UG'),
        ),
      );
    return row ?? null;
  }

  /**
   * Stamp the approval row with the coordinator's decision.
   * Stores: who decided, when, their comment, and optional attachment.
   */
  async updateApprovalDecision(
    approvalId: string,
    data: {
      decision: string;
      approverUserId: string;
      comment?: string;
      attachmentFileId?: string;
    },
  ) {
    await this.drizzle.db
      .update(schema.proposalApprovals)
      .set({
        decision: data.decision as any,
        approverUserId: data.approverUserId,
        comment: data.comment ?? null,
        attachmentFileId: data.attachmentFileId ?? null,
        decisionAt: new Date(),
      })
      .where(eq(schema.proposalApprovals.id, approvalId));
  }

  /**
   * Update the master proposal status and optionally unlock the workspace.
   * workspace_unlocked is only set to true when decision = 'Accepted'
   * (Coordinator is the FINAL approver for UG — is_final = true).
   */
  async updateProposalStatus(
    proposalId: string,
    data: {
      newStatus: string;
      unlockWorkspace: boolean;
    },
  ) {
    await this.drizzle.db
      .update(schema.proposals)
      .set({
        currentStatus: data.newStatus as any,
        updatedAt: new Date(),
        ...(data.unlockWorkspace && {
          workspaceUnlocked: true,
          workspaceUnlockedAt: new Date(),
        }),
      })
      .where(eq(schema.proposals.id, proposalId));
  }

  /**
   * Append a row to the immutable status history log.
   * The coordinator's comment is stored as the `note` so the researcher
   * can read WHY the status changed when they view the history.
   */
  async insertStatusHistory(data: {
    proposalId: string;
    oldStatus: string;
    newStatus: string;
    changedBy: string;
    note?: string;
  }) {
    await this.drizzle.db.insert(schema.proposalStatusHistory).values({
      proposalId: data.proposalId,
      oldStatus: data.oldStatus as any,
      newStatus: data.newStatus as any,
      changedBy: data.changedBy,
      note: data.note ?? null,
    });
  }

  /**
   * Insert a notification for the researcher so they see the decision
   * (and the comment if one was given) in their notification bell.
   */
  async insertNotification(data: {
    recipientUserId: string;
    senderUserId: string;
    type:
      | 'Submission'
      | 'Assigned'
      | 'Decision'
      | 'Comment'
      | 'Revision_Required'
      | 'Budget_Released'
      | 'Workspace_Unlocked';
    title: string;
    body: string;
    proposalId: string;
  }) {
    await this.drizzle.db.insert(schema.notifications).values({
      recipientUserId: data.recipientUserId,
      senderUserId: data.senderUserId,
      type: data.type,
      title: data.title,
      body: data.body,
      proposalId: data.proposalId,
    });
  }

  /**
   * Append a row to the audit log for compliance tracking.
   */
  async insertAuditLog(data: {
    actorUserId: string;
    entityId: string;
    metadata: Record<string, any>;
  }) {
    await this.drizzle.db.insert(schema.auditLogs).values({
      actorUserId: data.actorUserId,
      action: 'DECISION_MADE',
      entityType: 'proposal_approvals',
      entityId: data.entityId,
      metadata: data.metadata,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADVISORS: Queries used by getAdvisors + assignAdvisor
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * List all active users who hold the ADVISOR role.
   * Used by the coordinator to pick someone from a dropdown/list.
   * Also returns a count of how many proposals they are already
   * assigned to — useful for load balancing on the UI.
   */
  async findAllAdvisors() {
    return this.drizzle.db
      .select({
        id: schema.users.id,
        fullName: schema.users.fullName,
        email: schema.users.email,
        department: schema.users.department,
        university: schema.users.university,
        universityId: schema.users.universityId,
        phoneNumber: schema.users.phoneNumber,
        accountStatus: schema.users.accountStatus,
      })
      .from(schema.users)
      .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
      .where(
        and(
          eq(schema.userRoles.roleName, 'ADVISOR'),
          eq(schema.users.accountStatus, 'active'),
        ),
      )
      .orderBy(schema.users.fullName);
  }

  /**
   * Validate that a specific user holds the ADVISOR role.
   * Returns the user row if valid, null if user doesn't exist or lacks the role.
   */
  async findAdvisorById(userId: string) {
    const [row] = await this.drizzle.db
      .select({
        id: schema.users.id,
        fullName: schema.users.fullName,
        email: schema.users.email,
        department: schema.users.department,
        accountStatus: schema.users.accountStatus,
      })
      .from(schema.users)
      .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
      .where(
        and(
          eq(schema.users.id, userId),
          eq(schema.userRoles.roleName, 'ADVISOR'),
          eq(schema.users.accountStatus, 'active'),
        ),
      );
    return row ?? null;
  }

  /**
   * Check if this advisor is already assigned to this specific proposal.
   * Prevents duplicate assignments.
   */
  async findExistingAssignment(proposalId: string, advisorUserId: string) {
    const [row] = await this.drizzle.db
      .select({ id: schema.evaluatorAssignments.id })
      .from(schema.evaluatorAssignments)
      .where(
        and(
          eq(schema.evaluatorAssignments.proposalId, proposalId),
          eq(schema.evaluatorAssignments.evaluatorUserId, advisorUserId),
        ),
      );
    return row ?? null;
  }

  /**
   * Insert the formal assignment record into evaluator_assignments.
   * This is the audit trail of who was assigned by whom and when.
   */
  async insertEvaluatorAssignment(data: {
    proposalId: string;
    advisorUserId: string;
    assignedBy: string;
    dueDate?: string;
  }) {
    const [row] = await this.drizzle.db
      .insert(schema.evaluatorAssignments)
      .values({
        proposalId: data.proposalId,
        evaluatorUserId: data.advisorUserId,
        assignedBy: data.assignedBy,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      })
      .returning();
    return row;
  }

  /**
   * Add a member to the proposal with a specific role
   */
  async addProposalMember(
    proposalId: string,
    userId: string,
    role: 'PI' | 'ADVISOR' | 'MEMBER' | 'SUPERVISOR' | 'EVALUATOR',
  ) {
    return await this.drizzle.db
      .insert(schema.proposalMembers)
      .values({
        proposalId,
        userId,
        role,
      })
      .onConflictDoNothing()
      .returning();
  }

  /**
   * @deprecated Use addProposalMember instead
   * Advisors should be added to proposal_members table with role='ADVISOR'
   */
  async updateProposalAdvisor(proposalId: string, advisorUserId: string) {
    // Add advisor as a proposal member instead
    return this.addProposalMember(proposalId, advisorUserId, 'ADVISOR');
  }

  /**
   * Generic audit log insert (reused by both decision and assign flows).
   * action is passed in so this method is reusable.
   */
  async insertAuditLogAction(data: {
    actorUserId: string;
    action: 'DECISION_MADE' | 'EVALUATOR_ASSIGNED';
    entityType: string;
    entityId: string;
    metadata: Record<string, any>;
  }) {
    await this.drizzle.db.insert(schema.auditLogs).values({
      actorUserId: data.actorUserId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      metadata: data.metadata,
    });
  }
}
