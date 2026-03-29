import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { and, eq, ilike, or } from 'drizzle-orm';

@Injectable()
export class PgRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAllPgProposals(
    filters: { status?: string; search?: string },
    approverRole: string,
  ) {
    const rows = await this.drizzle.db
      .select({
        id: schema.proposals.id,
        title: schema.proposals.title,
        abstract: schema.proposals.abstract,
        proposalProgram: schema.proposals.proposalProgram,
        degreeLevel: schema.proposals.degreeLevel,
        researchArea: schema.proposals.researchArea,
        durationMonths: schema.proposals.durationMonths,
        currentStatus: schema.proposals.currentStatus,
        submittedAt: schema.proposals.submittedAt,
        workspaceUnlocked: schema.proposals.workspaceUnlocked,
        workspaceUnlockedAt: schema.proposals.workspaceUnlockedAt,
        createdAt: schema.proposals.createdAt,
        researcherId: schema.users.id,
        researcherName: schema.users.fullName,
        researcherEmail: schema.users.email,
        researcherDepartment: schema.users.department,
        approvalId: schema.proposalApprovals.id,
        approvalDecision: schema.proposalApprovals.decision,
        approvalComment: schema.proposalApprovals.comment,
        approvalDecisionAt: schema.proposalApprovals.decisionAt,
        approverUserId: schema.proposalApprovals.approverUserId,
        totalBudget: schema.budgetRequests.totalAmount,
      })
      .from(schema.proposals)
      .innerJoin(schema.users, eq(schema.users.id, schema.proposals.createdBy))
      .innerJoin(
        schema.proposalApprovals,
        and(
          eq(schema.proposalApprovals.proposalId, schema.proposals.id),
          eq(schema.proposalApprovals.approverRole, approverRole),
          eq(schema.proposalApprovals.decision, 'Pending'),
        ),
      )
      .leftJoin(
        schema.budgetRequests,
        eq(schema.budgetRequests.proposalId, schema.proposals.id),
      )
      .where(
        and(
          eq(schema.proposals.proposalProgram, 'PG'),
          filters.status
            ? eq(schema.proposals.currentStatus, filters.status as any)
            : undefined,
          filters.search
            ? or(
                ilike(schema.proposals.title, `%${filters.search}%`),
                ilike(schema.users.fullName, `%${filters.search}%`),
              )
            : undefined,
        ),
      )
      .orderBy(schema.proposals.submittedAt);

    return {
      count: rows.length,
      proposals: rows.map((p) => ({
        id: p.id,
        title: p.title,
        researchArea: p.researchArea,
        durationMonths: p.durationMonths,
        currentStatus: p.currentStatus,
        submittedAt: p.submittedAt,
        workspaceUnlocked: p.workspaceUnlocked,
        researcher: {
          id: p.researcherId,
          name: p.researcherName,
          email: p.researcherEmail,
          department: p.researcherDepartment,
        },
        approval: {
          id: p.approvalId,
          decision: p.approvalDecision,
          comment: p.approvalComment,
          decidedAt: p.approvalDecisionAt,
          decidedByUserId: p.approverUserId,
        },
        budget: {
          totalRequested: p.totalBudget,
        },
      })),
    };
  }

  async findOnePgProposal(proposalId: string) {
    const [core] = await this.drizzle.db
      .select({
        id: schema.proposals.id,
        title: schema.proposals.title,
        abstract: schema.proposals.abstract,
        proposalProgram: schema.proposals.proposalProgram,
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
          eq(schema.proposals.proposalProgram, 'PG'),
        ),
      );

    if (!core) return null;

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

    const approvalSteps = await this.drizzle.db
      .select({
        id: schema.proposalApprovals.id,
        stepOrder: schema.proposalApprovals.stepOrder,
        role: schema.proposalApprovals.approverRole,
        decision: schema.proposalApprovals.decision,
        comment: schema.proposalApprovals.comment,
        decidedAt: schema.proposalApprovals.decisionAt,
        approverName: schema.users.fullName,
      })
      .from(schema.proposalApprovals)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.proposalApprovals.approverUserId),
      )
      .where(eq(schema.proposalApprovals.proposalId, proposalId))
      .orderBy(schema.proposalApprovals.stepOrder);

    return {
      ...core,
      versions: fileRows,
      budget: {
        header: budgetHeader ?? null,
        items: budgetItems,
      },
      statusHistory,
      approvalSteps,
    };
  }

  async findPgProposalBasic(proposalId: string) {
    const [row] = await this.drizzle.db
      .select({
        id: schema.proposals.id,
        title: schema.proposals.title,
        currentStatus: schema.proposals.currentStatus,
        proposalProgram: schema.proposals.proposalProgram,
        createdBy: schema.proposals.createdBy,
      })
      .from(schema.proposals)
      .where(
        and(
          eq(schema.proposals.id, proposalId),
          eq(schema.proposals.proposalProgram, 'PG'),
        ),
      );
    return row ?? null;
  }

  async findPendingApprovalForRole(proposalId: string, approverRole: string) {
    const [row] = await this.drizzle.db
      .select()
      .from(schema.proposalApprovals)
      .where(
        and(
          eq(schema.proposalApprovals.proposalId, proposalId),
          eq(schema.proposalApprovals.approverRole, approverRole),
          eq(schema.proposalApprovals.decision, 'Pending'),
        ),
      );
    return row ?? null;
  }

  async findNextRole(data: {
    proposalProgram: string;
    currentStatus: string;
    actorRole: string;
  }) {
    const [row] = await this.drizzle.db
      .select({ nextRole: schema.routingRules.nextRole })
      .from(schema.routingRules)
      .where(
        and(
          eq(schema.routingRules.proposalProgram, data.proposalProgram as any),
          eq(schema.routingRules.currentStatus, data.currentStatus as any),
          eq(schema.routingRules.approverRole, data.actorRole),
        ),
      );
    return row?.nextRole ?? null;
  }

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

  async updateProposalAndBudgetStatus(
    proposalId: string,
    data: { newStatus: string; unlockWorkspace: boolean },
  ) {
    await this.drizzle.db.transaction(async (tx) => {
      await tx
        .update(schema.proposals)
        .set({
          currentStatus: data.newStatus as any,
          workspaceUnlocked: data.unlockWorkspace,
          workspaceUnlockedAt: data.unlockWorkspace ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.proposals.id, proposalId));

      await tx
        .update(schema.budgetRequests)
        .set({ currentStatus: data.newStatus as any })
        .where(eq(schema.budgetRequests.proposalId, proposalId));
    });
  }

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

  async insertNotification(data: {
    recipientUserId: string;
    senderUserId: string;
    type: string;
    title: string;
    body: string;
    proposalId: string;
    context?: Record<string, any>;
  }) {
    await this.drizzle.db.insert(schema.notifications).values({
      recipientUserId: data.recipientUserId,
      senderUserId: data.senderUserId,
      type: data.type as any,
      title: data.title,
      body: data.body,
      proposalId: data.proposalId,
      context: data.context ?? null,
    });
  }

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
}
