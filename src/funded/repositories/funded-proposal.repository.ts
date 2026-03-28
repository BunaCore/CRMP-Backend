import { Injectable, NotFoundException } from '@nestjs/common';
import { DrizzleService } from '../../db/db.service';
import * as schema from '../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { SubmitFundedDto } from '../dto/submit-funded.dto';
import { ReviewFundedDto } from '../dto/review-funded.dto';

@Injectable()
export class FundedProposalRepository {
  constructor(private readonly dbService: DrizzleService) {}

  /**
   * Submit a new Funded Project Proposal
   * Inserts the proposal, default version, budget request, and line items.
   */
  async createFundedProposal(userId: string, data: SubmitFundedDto) {
    return await this.dbService.db.transaction(async (tx) => {
      // 1. Insert base proposal
      const [proposal] = await tx
        .insert(schema.proposals)
        .values({
          createdBy: userId,
          title: data.title,
          abstract: data.abstract,
          proposalType: 'Funded_Project',
          researchArea: data.researchArea,
          durationMonths: data.durationMonths,
          currentStatus: 'Submitted',
          submittedAt: new Date(),
        })
        .returning();

      // 2. Insert initial version
      const [version] = await tx
        .insert(schema.proposalVersions)
        .values({
          proposalId: proposal.id,
          createdBy: userId,
          versionNumber: 1,
          isCurrent: true,
        })
        .returning();

      // Link version to proposal
      await tx
        .update(schema.proposals)
        .set({ currentVersionId: version.id })
        .where(eq(schema.proposals.id, proposal.id));

      // 3. Create Budget Request Total
      let totalAmount = 0;
      data.budgetItems.forEach(
        (item) => (totalAmount += Number(item.requestedAmount)),
      );

      const [budgetRequest] = await tx
        .insert(schema.budgetRequests)
        .values({
          proposalId: proposal.id,
          requestedBy: userId,
          totalAmount: totalAmount.toString(),
        })
        .returning();

      // 4. Insert individual budget line items
      if (data.budgetItems && data.budgetItems.length > 0) {
        const itemValues = data.budgetItems.map((item, index) => ({
          budgetRequestId: budgetRequest.id,
          lineIndex: index + 1,
          description: item.description,
          requestedAmount: item.requestedAmount.toString(),
        }));
        await tx.insert(schema.budgetRequestItems).values(itemValues);
      }

      return proposal;
    });
  }

  /**
   * Fetch all pending proposals for a specific approver role that matches their step order.
   */
  async getPendingProposalsForRole(roleName: string) {
    const pendingQuery = await this.dbService.db
      .select({
        proposal: schema.proposals,
        approval: schema.proposalApprovals,
        budget: schema.budgetRequests,
      })
      .from(schema.proposals)
      .innerJoin(
        schema.proposalApprovals,
        eq(schema.proposals.id, schema.proposalApprovals.proposalId),
      )
      .leftJoin(
        schema.budgetRequests,
        eq(schema.proposals.id, schema.budgetRequests.proposalId),
      )
      .where(
        and(
          eq(schema.proposalApprovals.approverRole, roleName),
          eq(schema.proposalApprovals.decision, 'Pending'),
          eq(schema.proposals.proposalType, 'Funded_Project'),
        ),
      );
    return pendingQuery;
  }

  /**
   * Assign multiple evaluators to a proposal.
   */
  async assignEvaluators(
    proposalId: string,
    assignedById: string,
    evaluatorIds: string[],
  ) {
    return await this.dbService.db.transaction(async (tx) => {
      // Create entries in evaluatorAssignments table
      const assignmentValues = evaluatorIds.map((uid) => ({
        proposalId,
        evaluatorUserId: uid,
        assignedBy: assignedById,
      }));

      const inserted = await tx
        .insert(schema.evaluatorAssignments)
        .values(assignmentValues)
        .returning();

      return inserted;
    });
  }

  /**
   * Update the decision for a specific step.
   */
  async updateApprovalDecision(
    approvalId: string,
    data: ReviewFundedDto,
    approverUserId: string,
  ) {
    return await this.dbService.db
      .update(schema.proposalApprovals)
      .set({
        decision: data.decision,
        comment: data.comment,
        decisionAt: new Date(),
        approverUserId: approverUserId,
        attachmentFileId: data.attachmentFileId || null,
      })
      .where(eq(schema.proposalApprovals.id, approvalId))
      .returning();
  }

  /**
   * Activate project and unlock workspace. This is the Master Approver final step.
   */
  async activateFundedProject(proposalId: string, approverUserId: string) {
    return await this.dbService.db.transaction(async (tx) => {
      // Fetch full proposal context
      const [proposal] = await tx
        .select()
        .from(schema.proposals)
        .where(eq(schema.proposals.id, proposalId))
        .limit(1);

      if (!proposal) throw new NotFoundException('Proposal not found');

      const budgetReqs = await tx
        .select()
        .from(schema.budgetRequests)
        .where(eq(schema.budgetRequests.proposalId, proposalId));

      // Create the live project
      const [project] = await tx
        .insert(schema.projects)
        .values({
          projectTitle: proposal.title,
          projectType: 'Funded',
          projectStage: 'Approved',
          submissionDate: (proposal.submittedAt
            ? proposal.submittedAt.toISOString()
            : new Date().toISOString()
          ).split('T')[0],
          durationMonths: proposal.durationMonths || 12, // Default if null
          PI_ID: proposal.createdBy,
          ethicalClearanceStatus: 'Pending', // Defaults
          researchArea: proposal.researchArea,
        })
        .returning();

      // Add PI as a project member
      await tx.insert(schema.projectMembers).values({
        projectId: project.projectId,
        userId: proposal.createdBy,
        role: 'PI',
      });

      // Tie project to proposal & unlock workspace
      await tx
        .update(schema.proposals)
        .set({
          currentStatus: 'Approved',
          projectId: project.projectId,
          workspaceUnlocked: true,
          workspaceUnlockedAt: new Date(),
        })
        .where(eq(schema.proposals.id, proposalId));

      // Append status history
      await tx.insert(schema.proposalStatusHistory).values({
        proposalId,
        oldStatus: 'Under_Review',
        newStatus: 'Approved',
        changedBy: approverUserId,
        changedAt: new Date(),
      });

      // Update Budget Requests to link project id
      if (budgetReqs && budgetReqs.length > 0) {
        await tx
          .update(schema.budgetRequests)
          .set({ projectId: project.projectId })
          .where(eq(schema.budgetRequests.id, budgetReqs[0].id));
      }

      return project;
    });
  }
}
