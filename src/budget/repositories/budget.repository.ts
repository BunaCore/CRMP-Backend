import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DrizzleService } from '../../db/db.service';
import { eq, and, inArray, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';

@Injectable()
export class BudgetRepository {
  private get db() {
    return this.dbService.db;
  }

  constructor(private readonly dbService: DrizzleService) {}

  // ─── PI QUERIES ──────────────────────────────────────────────────────────

  /**
   * Returns all projects where the user is a PI AND the project is Approved.
   * Also fetches the approved budget amount from the linked proposal,
   * and computes total disbursed (sum of PAID disbursement requests).
   */
  async getMyProjectsAsPi(userId: string) {
    // Fetch PI projects
    const piProjects = await this.db
      .select({
        projectId: schema.projects.projectId,
        projectTitle: schema.projects.projectTitle,
        projectProgram: schema.projects.projectProgram,
        projectStage: schema.projects.projectStage,
        isFunded: schema.projects.isFunded,
      })
      .from(schema.projectMembers)
      .innerJoin(
        schema.projects,
        eq(schema.projectMembers.projectId, schema.projects.projectId),
      )
      .where(
        and(
          eq(schema.projectMembers.userId, userId),
          eq(schema.projectMembers.role, 'PI'),
          eq(schema.projects.projectStage, 'Approved'),
          eq(schema.projects.isFunded, true),
        ),
      );

    if (piProjects.length === 0) return [];

    const projectIds = piProjects.map((p) => p.projectId);

    // Fetch approved budget amounts from proposals
    const proposals = await this.db
      .select({
        projectId: schema.proposals.projectId,
        budgetAmount: schema.proposals.budgetAmount,
      })
      .from(schema.proposals)
      .where(inArray(schema.proposals.projectId, projectIds));

    // Fetch total disbursed (PAID) per project
    const disbursedRows = await this.db
      .select({
        projectId: schema.disbursementRequests.projectId,
        totalDisbursed: sql<string>`COALESCE(SUM(${schema.disbursementRequests.totalAmount}), 0)`,
      })
      .from(schema.disbursementRequests)
      .where(
        and(
          inArray(schema.disbursementRequests.projectId, projectIds),
          eq(schema.disbursementRequests.status, 'PAID'),
        ),
      )
      .groupBy(schema.disbursementRequests.projectId);

    // Fetch active (PENDING or RESUBMITTED) request status per project
    const activeRequests = await this.db
      .select({
        projectId: schema.disbursementRequests.projectId,
        status: schema.disbursementRequests.status,
      })
      .from(schema.disbursementRequests)
      .where(
        and(
          inArray(schema.disbursementRequests.projectId, projectIds),
          inArray(schema.disbursementRequests.status, [
            'PENDING',
            'RESUBMITTED',
            'RETURNED',
          ]),
        ),
      );

    // Build lookup maps
    const proposalMap = new Map(proposals.map((p) => [p.projectId, p]));
    const disbursedMap = new Map(
      disbursedRows.map((r) => [r.projectId, r.totalDisbursed]),
    );
    const activeMap = new Map(
      activeRequests.map((r) => [r.projectId, r.status]),
    );

    return piProjects.map((p) => ({
      projectId: p.projectId,
      title: p.projectTitle,
      projectType: p.projectProgram,
      totalApprovedBudget: proposalMap.get(p.projectId)?.budgetAmount ?? '0',
      totalDisbursed: disbursedMap.get(p.projectId) ?? '0',
      activeRequestStatus: activeMap.get(p.projectId) ?? null,
    }));
  }

  /**
   * Returns all project_budget_items for a project, plus all
   * disbursement_requests for that project ordered by requestSequence ASC,
   * with each request including its items and clearance file metadata.
   */
  async getProjectBudgetDashboard(projectId: string, userId: string) {
    // Verify user is PI of this project
    const membership = await this.db
      .select()
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, userId),
          eq(schema.projectMembers.role, 'PI'),
        ),
      )
      .limit(1);

    if (membership.length === 0) {
      throw new ForbiddenException('You are not the PI of this project.');
    }

    // Fetch project + proposal info
    const [project] = await this.db
      .select({
        projectId: schema.projects.projectId,
        projectTitle: schema.projects.projectTitle,
        projectProgram: schema.projects.projectProgram,
        budgetAmount: schema.proposals.budgetAmount,
      })
      .from(schema.projects)
      .leftJoin(
        schema.proposals,
        eq(schema.proposals.projectId, schema.projects.projectId),
      )
      .where(eq(schema.projects.projectId, projectId))
      .limit(1);

    if (!project) throw new NotFoundException('Project not found.');

    // Fetch all budget items
    const budgetItems = await this.db
      .select()
      .from(schema.projectBudgetItems)
      .where(eq(schema.projectBudgetItems.projectId, projectId));

    // Fetch all disbursement requests (ordered by sequence)
    const requests = await this.db
      .select()
      .from(schema.disbursementRequests)
      .where(eq(schema.disbursementRequests.projectId, projectId))
      .orderBy(schema.disbursementRequests.requestSequence);

    // For each request, fetch its junction items and clearance file
    const enrichedRequests = await Promise.all(
      requests.map(async (req) => {
        const junctionItems = await this.db
          .select({
            id: schema.disbursementRequestItems.id,
            budgetItemId: schema.disbursementRequestItems.budgetItemId,
            description: schema.projectBudgetItems.description,
            amount: schema.projectBudgetItems.amount,
          })
          .from(schema.disbursementRequestItems)
          .innerJoin(
            schema.projectBudgetItems,
            eq(
              schema.disbursementRequestItems.budgetItemId,
              schema.projectBudgetItems.id,
            ),
          )
          .where(
            eq(schema.disbursementRequestItems.disbursementRequestId, req.id),
          );

        let clearanceFile: {
          id: string;
          originalName: string;
          storagePath: string;
          bucket: string | null;
        } | null = null;

        if (req.clearanceFileId) {
          const [cf] = await this.db
            .select({
              id: schema.files.id,
              originalName: schema.files.originalName,
              storagePath: schema.files.storagePath,
              bucket: schema.files.bucket,
            })
            .from(schema.files)
            .where(eq(schema.files.id, req.clearanceFileId))
            .limit(1);
          clearanceFile = cf ?? null;
        }

        return { ...req, items: junctionItems, clearanceFile };
      }),
    );

    return {
      project,
      budgetItems,
      disbursementRequests: enrichedRequests,
    };
  }

  /**
   * Validates items and project membership before creating a request.
   * Returns validated items with their amounts.
   */
  async validateAndFetchItemsForRequest(
    projectId: string,
    userId: string,
    budgetItemIds: string[],
  ) {
    // 1. PI ownership
    const membership = await this.db
      .select()
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, userId),
          eq(schema.projectMembers.role, 'PI'),
        ),
      )
      .limit(1);

    if (membership.length === 0) {
      throw new ForbiddenException('You are not the PI of this project.');
    }

    // 2. No concurrent PENDING or RESUBMITTED request restriction removed
    // We now allow multiple requests to be submitted in parallel as long as budget is available.

    // 3. No unresolved RETURNED request
    const returnedReq = await this.db
      .select()
      .from(schema.disbursementRequests)
      .where(
        and(
          eq(schema.disbursementRequests.projectId, projectId),
          eq(schema.disbursementRequests.status, 'RETURNED'),
        ),
      )
      .limit(1);

    if (returnedReq.length > 0) {
      throw new BadRequestException(
        'You must fix and resubmit your returned request before creating a new one.',
      );
    }

    // 4. Item availability
    const items = await this.db
      .select()
      .from(schema.projectBudgetItems)
      .where(
        and(
          inArray(schema.projectBudgetItems.id, budgetItemIds),
          eq(schema.projectBudgetItems.projectId, projectId),
        ),
      );

    if (items.length !== budgetItemIds.length) {
      throw new BadRequestException(
        'One or more selected items do not belong to this project.',
      );
    }

    const unavailable = items.filter((i) => i.status !== 'AVAILABLE');
    if (unavailable.length > 0) {
      throw new BadRequestException(
        'One or more selected items are not available.',
      );
    }

    return items;
  }

  /**
   * Atomically creates a disbursement request and marks items as PENDING_DISBURSEMENT.
   */
  async createDisbursementRequest(
    projectId: string,
    userId: string,
    budgetItemIds: string[],
    totalAmount: number,
    requestSequence: number,
    clearanceFileId: string | null,
  ) {
    return await this.db.transaction(async (tx) => {
      // 1. Create the request
      const [request] = await tx
        .insert(schema.disbursementRequests)
        .values({
          projectId,
          requestedBy: userId,
          requestSequence,
          totalAmount: totalAmount.toString(),
          status: 'PENDING',
          clearanceFileId: clearanceFileId ?? null,
          submittedAt: new Date(),
        })
        .returning();

      // 2. Insert junction items
      const junctionValues = budgetItemIds.map((id) => ({
        disbursementRequestId: request.id,
        budgetItemId: id,
      }));
      await tx.insert(schema.disbursementRequestItems).values(junctionValues);

      // 3. Mark items as PENDING_DISBURSEMENT
      await tx
        .update(schema.projectBudgetItems)
        .set({ status: 'PENDING_DISBURSEMENT' })
        .where(inArray(schema.projectBudgetItems.id, budgetItemIds));

      return request;
    });
  }

  /**
   * Gets the count of all disbursement requests for a project (for sequence numbering).
   */
  async getDisbursementRequestCount(projectId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.disbursementRequests)
      .where(eq(schema.disbursementRequests.projectId, projectId));
    return Number(result[0]?.count ?? 0);
  }

  /**
   * Validates that the request belongs to the user and is in RETURNED status.
   */
  async validateResubmission(requestId: string, userId: string) {
    const [request] = await this.db
      .select()
      .from(schema.disbursementRequests)
      .where(eq(schema.disbursementRequests.id, requestId))
      .limit(1);

    if (!request) {
      throw new NotFoundException('Disbursement request not found.');
    }
    if (request.requestedBy !== userId) {
      throw new ForbiddenException('You are not the owner of this request.');
    }
    if (request.status !== 'RETURNED') {
      throw new BadRequestException(
        'Only returned requests can be resubmitted.',
      );
    }

    return request;
  }

  /**
   * Updates clearance file and sets status to RESUBMITTED.
   */
  async resubmitDisbursementRequest(
    requestId: string,
    newClearanceFileId: string,
  ) {
    const [updated] = await this.db
      .update(schema.disbursementRequests)
      .set({
        clearanceFileId: newClearanceFileId,
        status: 'RESUBMITTED',
        updatedAt: new Date(),
      })
      .where(eq(schema.disbursementRequests.id, requestId))
      .returning();

    return updated;
  }

  // ─── FINANCE QUERIES ────────────────────────────────────────────────────────

  /**
   * Returns 4-metric summary for the admin dashboard header cards.
   */
  async getAdminMetrics(): Promise<{
    totalPendingAmount: number;
    pendingCount: number;
    totalDisbursedAllTime: number;
    awaitingCorrectionCount: number;
  }> {
    const [pendingRow] = await this.db
      .select({
        totalAmount: sql<string>`COALESCE(SUM(${schema.disbursementRequests.totalAmount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.disbursementRequests)
      .where(
        inArray(schema.disbursementRequests.status, ['PENDING', 'RESUBMITTED']),
      );

    const [paidRow] = await this.db
      .select({
        totalAmount: sql<string>`COALESCE(SUM(${schema.disbursementRequests.totalAmount}), 0)`,
      })
      .from(schema.disbursementRequests)
      .where(eq(schema.disbursementRequests.status, 'PAID'));

    const [returnedRow] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.disbursementRequests)
      .where(eq(schema.disbursementRequests.status, 'RETURNED'));

    return {
      totalPendingAmount: Number(pendingRow?.totalAmount ?? 0),
      pendingCount: Number(pendingRow?.count ?? 0),
      totalDisbursedAllTime: Number(paidRow?.totalAmount ?? 0),
      awaitingCorrectionCount: Number(returnedRow?.count ?? 0),
    };
  }

  /**
   * Lists all disbursement requests with project, PI, and item info.
   * statusFilter can be empty (return all) or filtered by status array.
   */
  async listAllDisbursementRequests(statusFilter: string[]): Promise<any[]> {
    const conditions =
      statusFilter && statusFilter.length > 0
        ? inArray(
            schema.disbursementRequests.status,
            statusFilter as (
              | 'PENDING'
              | 'RETURNED'
              | 'RESUBMITTED'
              | 'PAID'
              | 'REJECTED'
            )[],
          )
        : undefined;

    const rows = await this.db
      .select({
        id: schema.disbursementRequests.id,
        projectId: schema.disbursementRequests.projectId,
        requestedBy: schema.disbursementRequests.requestedBy,
        requestSequence: schema.disbursementRequests.requestSequence,
        totalAmount: schema.disbursementRequests.totalAmount,
        status: schema.disbursementRequests.status,
        clearanceFileId: schema.disbursementRequests.clearanceFileId,
        bankTransactionId: schema.disbursementRequests.bankTransactionId,
        financeFeedback: schema.disbursementRequests.financeFeedback,
        submittedAt: schema.disbursementRequests.submittedAt,
        paidAt: schema.disbursementRequests.paidAt,
        projectTitle: schema.projects.projectTitle,
        projectProgram: schema.projects.projectProgram,
        piName: schema.users.fullName,
        piEmail: schema.users.email,
      })
      .from(schema.disbursementRequests)
      .innerJoin(
        schema.projects,
        eq(schema.disbursementRequests.projectId, schema.projects.projectId),
      )
      .innerJoin(
        schema.users,
        eq(schema.disbursementRequests.requestedBy, schema.users.id),
      )
      .where(conditions)
      .orderBy(schema.disbursementRequests.submittedAt);

    // Fetch items for each request
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const items = await this.db
          .select({
            id: schema.projectBudgetItems.id,
            description: schema.projectBudgetItems.description,
            category: schema.projectBudgetItems.category,
            amount: schema.projectBudgetItems.amount,
          })
          .from(schema.disbursementRequestItems)
          .innerJoin(
            schema.projectBudgetItems,
            eq(
              schema.disbursementRequestItems.budgetItemId,
              schema.projectBudgetItems.id,
            ),
          )
          .where(
            eq(schema.disbursementRequestItems.disbursementRequestId, row.id),
          );

        return {
          requestId: row.id,
          projectId: row.projectId,
          projectTitle: row.projectTitle,
          projectType: row.projectProgram,
          piName: row.piName,
          piEmail: row.piEmail,
          requestSequence: row.requestSequence,
          totalAmount: Number(row.totalAmount),
          status: row.status,
          submittedAt: row.submittedAt,
          paidAt: row.paidAt,
          clearanceRequired: row.requestSequence > 1,
          clearanceFileId: row.clearanceFileId, // service enriches URL
          clearanceDocumentUrl: null, // populated by service
          bankTransactionId: row.bankTransactionId,
          financeFeedback: row.financeFeedback,
          items,
        };
      }),
    );

    return enriched;
  }

  /**
   * Full detail for a single disbursement request (Review Drawer).
   */
  async getDisbursementRequestDetail(requestId: string): Promise<any> {
    const [row] = await this.db
      .select({
        id: schema.disbursementRequests.id,
        projectId: schema.disbursementRequests.projectId,
        requestedBy: schema.disbursementRequests.requestedBy,
        requestSequence: schema.disbursementRequests.requestSequence,
        totalAmount: schema.disbursementRequests.totalAmount,
        status: schema.disbursementRequests.status,
        clearanceFileId: schema.disbursementRequests.clearanceFileId,
        bankTransactionId: schema.disbursementRequests.bankTransactionId,
        financeFeedback: schema.disbursementRequests.financeFeedback,
        submittedAt: schema.disbursementRequests.submittedAt,
        paidAt: schema.disbursementRequests.paidAt,
        projectTitle: schema.projects.projectTitle,
        projectProgram: schema.projects.projectProgram,
        piName: schema.users.fullName,
        piEmail: schema.users.email,
        piPhone: schema.users.phoneNumber,
        budgetAmount: schema.proposals.budgetAmount,
      })
      .from(schema.disbursementRequests)
      .innerJoin(
        schema.projects,
        eq(schema.disbursementRequests.projectId, schema.projects.projectId),
      )
      .innerJoin(
        schema.users,
        eq(schema.disbursementRequests.requestedBy, schema.users.id),
      )
      .leftJoin(
        schema.proposals,
        eq(schema.proposals.projectId, schema.disbursementRequests.projectId),
      )
      .where(eq(schema.disbursementRequests.id, requestId))
      .limit(1);

    if (!row) throw new NotFoundException('Disbursement request not found.');

    // Fetch line items
    const items = await this.db
      .select({
        id: schema.projectBudgetItems.id,
        description: schema.projectBudgetItems.description,
        category: schema.projectBudgetItems.category,
        amount: schema.projectBudgetItems.amount,
      })
      .from(schema.disbursementRequestItems)
      .innerJoin(
        schema.projectBudgetItems,
        eq(
          schema.disbursementRequestItems.budgetItemId,
          schema.projectBudgetItems.id,
        ),
      )
      .where(eq(schema.disbursementRequestItems.disbursementRequestId, row.id));

    // Clearance file metadata
    let clearanceDocumentName: string | null = null;
    if (row.clearanceFileId) {
      const [cf] = await this.db
        .select({ originalName: schema.files.originalName })
        .from(schema.files)
        .where(eq(schema.files.id, row.clearanceFileId))
        .limit(1);
      clearanceDocumentName = cf?.originalName ?? null;
    }

    // Budget summary
    const allRequests = await this.db
      .select({
        totalAmount: schema.disbursementRequests.totalAmount,
        status: schema.disbursementRequests.status,
      })
      .from(schema.disbursementRequests)
      .where(eq(schema.disbursementRequests.projectId, row.projectId));

    const totalApprovedBudget = Number(row.budgetAmount ?? 0);
    const totalPaid = allRequests
      .filter((r) => r.status === 'PAID')
      .reduce((s, r) => s + Number(r.totalAmount), 0);
    const totalPending = ['PENDING', 'RESUBMITTED'].includes(row.status)
      ? Number(row.totalAmount)
      : 0;

    // Disbursement timeline
    const timeline = await this.db
      .select({
        requestSequence: schema.disbursementRequests.requestSequence,
        totalAmount: schema.disbursementRequests.totalAmount,
        status: schema.disbursementRequests.status,
        paidAt: schema.disbursementRequests.paidAt,
        bankTransactionId: schema.disbursementRequests.bankTransactionId,
        submittedAt: schema.disbursementRequests.submittedAt,
      })
      .from(schema.disbursementRequests)
      .where(eq(schema.disbursementRequests.projectId, row.projectId))
      .orderBy(schema.disbursementRequests.requestSequence);

    return {
      requestId: row.id,
      projectId: row.projectId,
      projectTitle: row.projectTitle,
      projectType: row.projectProgram,
      piName: row.piName,
      piEmail: row.piEmail,
      piPhone: row.piPhone,
      piBankName: null, // future: user_bank_details table
      piBankAccountNumber: null, // future: user_bank_details table
      requestSequence: row.requestSequence,
      totalAmount: Number(row.totalAmount),
      status: row.status,
      submittedAt: row.submittedAt,
      clearanceRequired: row.requestSequence > 1,
      clearanceFileId: row.clearanceFileId, // service enriches URL
      clearanceDocumentUrl: null, // populated by service
      clearanceDocumentName,
      items,
      projectBudgetSummary: {
        totalApprovedBudget,
        totalPaid,
        totalPending,
        totalRemaining: totalApprovedBudget - totalPaid - totalPending,
      },
      disbursementTimeline: timeline.map((t) => ({
        sequence: t.requestSequence,
        amount: Number(t.totalAmount),
        status: t.status,
        paidAt: t.paidAt,
        bankTransactionId: t.bankTransactionId,
        submittedAt: t.submittedAt,
      })),
    };
  }

  /**
   * Validates a request is actionable by finance (PENDING or RESUBMITTED).
   * Also enforces the clearance document gate for sequence > 1.
   */
  async validateForFinanceAction(requestId: string): Promise<any> {
    const [request] = await this.db
      .select()
      .from(schema.disbursementRequests)
      .where(eq(schema.disbursementRequests.id, requestId))
      .limit(1);

    if (!request)
      throw new NotFoundException('Disbursement request not found.');

    if (!['PENDING', 'RESUBMITTED'].includes(request.status)) {
      throw new BadRequestException(
        `Cannot action a request with status '${request.status}'. Only PENDING or RESUBMITTED requests can be processed.`,
      );
    }

    // Clearance gate: if sequence > 1, a clearance file must be present
    if (request.requestSequence > 1 && !request.clearanceFileId) {
      throw new BadRequestException(
        'Cannot approve: PI has not uploaded a clearance document.',
      );
    }

    return request;
  }

  /**
   * Transactionally marks a request as PAID and sets all linked budget items to PAID.
   */
  async approveDisbursementRequest(
    requestId: string,
    financeUserId: string,
    bankTransactionId: string,
  ) {
    return await this.db.transaction(async (tx) => {
      // Get linked budget item IDs
      const junctionItems = await tx
        .select()
        .from(schema.disbursementRequestItems)
        .where(
          eq(schema.disbursementRequestItems.disbursementRequestId, requestId),
        );
      const itemIds = junctionItems.map((j) => j.budgetItemId);

      // Update request to PAID
      const [updated] = await tx
        .update(schema.disbursementRequests)
        .set({
          status: 'PAID',
          bankTransactionId,
          financeApprovedBy: financeUserId,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.disbursementRequests.id, requestId))
        .returning();

      // Mark all linked items as PAID
      if (itemIds.length > 0) {
        await tx
          .update(schema.projectBudgetItems)
          .set({ status: 'PAID' })
          .where(inArray(schema.projectBudgetItems.id, itemIds));
      }

      return updated;
    });
  }

  /**
   * Transactionally marks a request as RETURNED and reverts linked budget items to AVAILABLE.
   */
  async returnDisbursementRequest(
    requestId: string,
    financeUserId: string,
    feedback: string,
  ) {
    return await this.db.transaction(async (tx) => {
      // Get linked budget item IDs
      const junctionItems = await tx
        .select()
        .from(schema.disbursementRequestItems)
        .where(
          eq(schema.disbursementRequestItems.disbursementRequestId, requestId),
        );
      const itemIds = junctionItems.map((j) => j.budgetItemId);

      // Update request to RETURNED
      const [updated] = await tx
        .update(schema.disbursementRequests)
        .set({
          status: 'RETURNED',
          financeFeedback: feedback,
          returnedBy: financeUserId,
          returnedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.disbursementRequests.id, requestId))
        .returning();

      // Revert items to AVAILABLE so PI can re-select them in corrected request
      if (itemIds.length > 0) {
        await tx
          .update(schema.projectBudgetItems)
          .set({ status: 'AVAILABLE' })
          .where(inArray(schema.projectBudgetItems.id, itemIds));
      }

      return updated;
    });
  }

  /**
   * Transactionally marks a request as REJECTED and reverts linked budget items to AVAILABLE.
   */
  async rejectDisbursementRequest(
    requestId: string,
    financeUserId: string,
    feedback: string,
  ) {
    return await this.db.transaction(async (tx) => {
      // Get linked budget item IDs
      const junctionItems = await tx
        .select()
        .from(schema.disbursementRequestItems)
        .where(
          eq(schema.disbursementRequestItems.disbursementRequestId, requestId),
        );
      const itemIds = junctionItems.map((j) => j.budgetItemId);

      // Update request to REJECTED
      const [updated] = await tx
        .update(schema.disbursementRequests)
        .set({
          status: 'REJECTED',
          financeFeedback: feedback,
          returnedBy: financeUserId,
          returnedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.disbursementRequests.id, requestId))
        .returning();

      // Revert items to AVAILABLE
      if (itemIds.length > 0) {
        await tx
          .update(schema.projectBudgetItems)
          .set({ status: 'AVAILABLE' })
          .where(inArray(schema.projectBudgetItems.id, itemIds));
      }

      return updated;
    });
  }

  /**
   * Returns all disbursement requests formatted for a ledger export (CSV).
   */
  async getLedgerData() {
    return this.db
      .select({
        requestId: schema.disbursementRequests.id,
        projectId: schema.disbursementRequests.projectId,
        projectTitle: schema.projects.projectTitle,
        piName: schema.users.fullName,
        amount: schema.disbursementRequests.totalAmount,
        status: schema.disbursementRequests.status,
        submittedAt: schema.disbursementRequests.submittedAt,
        paidAt: schema.disbursementRequests.paidAt,
        bankTransactionId: schema.disbursementRequests.bankTransactionId,
      })
      .from(schema.disbursementRequests)
      .innerJoin(
        schema.projects,
        eq(schema.disbursementRequests.projectId, schema.projects.projectId),
      )
      .innerJoin(
        schema.users,
        eq(schema.disbursementRequests.requestedBy, schema.users.id),
      )
      .orderBy(schema.disbursementRequests.submittedAt);
  }
}
