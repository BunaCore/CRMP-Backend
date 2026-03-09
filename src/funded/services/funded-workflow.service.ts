import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import * as schema from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { FundedRoutingRepository } from '../repositories/funded-routing.repository';
import { FundedProposalRepository } from '../repositories/funded-proposal.repository';
import { ReviewFundedDto } from '../dto/review-funded.dto';
import { SubmitFundedDto } from '../dto/submit-funded.dto';

@Injectable()
export class FundedWorkflowService {
    constructor(
        private readonly dbService: DbService,
        private readonly routingRepo: FundedRoutingRepository,
        private readonly proposalRepo: FundedProposalRepository,
    ) { }

    /**
     * Initializes the entire funded project workflow when the PI submits.
     */
    async submitProposal(userId: string, data: SubmitFundedDto) {
        // 1. Create the proposal, versions, and budget
        const proposal = await this.proposalRepo.createFundedProposal(userId, data);

        // 2. Initialize the first step in the routing rules (RAD)
        await this.routingRepo.initializeRoutingBlock(proposal.id);

        return proposal;
    }

    /**
     * Core Engine: Processes decisions (RAD, Evaluators, Finance, VPRTT, AC).
     * Checks > 500k rules, resets on Needs_Revision, and unlocks workspace as Master Approver.
     */
    async processReview(proposalId: string, approvalId: string, userId: string, userRole: string, data: ReviewFundedDto) {
        // 1. Fetch the specific approval step context
        const currentApproval = await this.dbService.db.query.proposalApprovals.findFirst({
            where: and(
                eq(schema.proposalApprovals.id, approvalId),
                eq(schema.proposalApprovals.proposalId, proposalId)
            )
        });

        if (!currentApproval) {
            throw new NotFoundException('Pending approval step not found.');
        }
        if (currentApproval.decision !== 'Pending') {
            throw new BadRequestException('This approval step has already been completed.');
        }

        // Security layer: enforce caller holds the required role
        if (currentApproval.approverRole !== userRole) {
            throw new ForbiddenException(`Access denied. This step requires the ${currentApproval.approverRole} role.`);
        }

        // Fetch budget context
        const budgetReq = await this.dbService.db.query.budgetRequests.findFirst({
            where: eq(schema.budgetRequests.proposalId, proposalId)
        });

        let operatingBudget = Number(budgetReq?.totalAmount || 0);

        // If Finance is giving their final approved amount
        if (currentApproval.approverRole === 'FINANCE' && data.approvedAmount !== undefined && budgetReq) {
            await this.dbService.db.update(schema.budgetRequests)
                .set({
                    approvedAmount: data.approvedAmount.toString(),
                    financeApprovedBy: userId,
                    financeApprovedAt: new Date()
                })
                .where(eq(schema.budgetRequests.id, budgetReq.id));
            operatingBudget = data.approvedAmount;
        } else if (budgetReq && budgetReq.approvedAmount) {
            operatingBudget = Number(budgetReq.approvedAmount); // Lock to finance-approved budget for VPRTT/AC checks
        }

        // 2. Register the decision physically to the DB
        await this.proposalRepo.updateApprovalDecision(approvalId, data, userId);

        // 3. Reject / Revision Engine - Flow completely halts and resets!
        if (data.decision === 'Rejected' || data.decision === 'Needs_Revision') {
            await this.dbService.db.update(schema.proposals)
                .set({
                    currentStatus: data.decision,
                    updatedAt: new Date()
                })
                .where(eq(schema.proposals.id, proposalId));

            await this.dbService.db.insert(schema.proposalStatusHistory).values({
                proposalId,
                oldStatus: 'Under_Review',
                newStatus: data.decision as any,
                changedBy: userId,
                note: `Workflow reset due to ${data.decision} by ${userRole}. Comment: ${data.comment || 'None'}`,
                changedAt: new Date(),
            });

            return { message: `Proposal marked as ${data.decision}. Workflow halted.` };
        }

        // 4. Acceptance Engine - Parallel handling, routing advancement, and Master Approver activation
        if (data.decision === 'Accepted') {

            // Parallel Validation Check for Evaluators
            if (currentApproval.approverRole === 'EVALUATOR') {
                const parallelSteps = await this.dbService.db.query.proposalApprovals.findMany({
                    where: and(
                        eq(schema.proposalApprovals.proposalId, proposalId),
                        eq(schema.proposalApprovals.stepOrder, currentApproval.stepOrder)
                    )
                });

                // Confirm ALL parallel steps (for the current row that was just accepted, and the rest from the DB)
                const allAccepted = parallelSteps.every(s =>
                    (s.id === approvalId ? data.decision : s.decision) === 'Accepted'
                );

                if (!allAccepted) {
                    // Tell the system to stop—do NOT trigger next routing step. We wait for others.
                    return { message: `Decision Accepted recorded. Waiting for other evaluators to finish.` };
                }
            }

            // If we are here, we are the final valid person in this step order. Proceed chronological route!
            // This internally checks '> 500k' for AC bypass logic.
            const nextStepResult = await this.routingRepo.triggerNextApprovalStep(
                proposalId,
                currentApproval.stepOrder,
                operatingBudget
            );

            // Master Approver Final Check
            // Evaluates true if we literally ran out of routing rules OR the >500k bypass was triggered.
            if (nextStepResult === null || nextStepResult === 'AC_SKIPPED') {
                // Unlock Workspace and Activate the Project immediately!
                const activatedProject = await this.proposalRepo.activateFundedProject(proposalId, userId);
                return {
                    message: `Project Fully Approved! Workspace Unlocked (${nextStepResult === 'AC_SKIPPED' ? 'AC Bypassed' : 'Final Step'}).`,
                    projectId: activatedProject.projectId
                };
            }

            // Otherwise, the flow continues normally
            return { message: `Proposal advanced to routing step ${currentApproval.stepOrder + 1}.` };
        }
    }
}
