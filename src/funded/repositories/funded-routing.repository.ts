import { Injectable } from '@nestjs/common';
import { DrizzleService } from '../../db/db.service';
import * as schema from '../../db/schema';
import { eq, and, asc } from 'drizzle-orm';

@Injectable()
export class FundedRoutingRepository {
    constructor(private readonly dbService: DrizzleService) { }

    /**
     * Fetch the routing rules specifically for Funded Projects
     */
    async getFundedRoutingRules() {
        return await this.dbService.db.query.routingRules.findMany({
            where: eq(schema.routingRules.proposalType, 'Funded_Project'),
            orderBy: [asc(schema.routingRules.stepOrder)],
        });
    }

    /**
     * Initialize the very first step of the routing rules when a proposal is submitted.
     * This generates the first pending approval log for the RAD.
     */
    async initializeRoutingBlock(proposalId: string) {
        return await this.dbService.db.transaction(async (tx) => {
            const rules = await tx.select()
                .from(schema.routingRules)
                .where(eq(schema.routingRules.proposalType, 'Funded_Project'))
                .orderBy(asc(schema.routingRules.stepOrder));

            if (!rules || rules.length === 0) {
                throw new Error('Routing rules for Funded_Project not found');
            }

            // Initialize the first step (RAD)
            const firstRule = rules[0];
            const initialApproval = await tx.insert(schema.proposalApprovals).values({
                proposalId,
                routingRuleId: firstRule.id,
                stepOrder: firstRule.stepOrder,
                approverRole: firstRule.approverRole,
                decision: 'Pending',
                createdAt: new Date(),
            }).returning();

            return initialApproval[0];
        });
    }

    /**
     * Generate the next sequential approval step based on the routing rules.
     * Ensures that the total budget logic applies dynamic AC assignment if required.
     */
    async triggerNextApprovalStep(proposalId: string, currentStepOrder: number, totalAmount: number) {
        return await this.dbService.db.transaction(async (tx) => {
            // Find the rule for the next step
            const nextStepOrder = currentStepOrder + 1;
            const nextRuleData = await tx.select()
                .from(schema.routingRules)
                .where(
                    and(
                        eq(schema.routingRules.proposalType, 'Funded_Project'),
                        eq(schema.routingRules.stepOrder, nextStepOrder)
                    )
                )
                .limit(1);

            if (nextRuleData.length === 0) {
                return null; // The routing chain is finished
            }

            const nextRule = nextRuleData[0];

            // Dynamic AC Bypass Logic: Skip step if the actual role is "AC" and total amount is <= 500000
            if (nextRule.approverRole === 'AC' && totalAmount <= 500000) {
                return 'AC_SKIPPED';
            }

            // If next step is EVALUATOR (parallel), we need to create an approval step for EACH assigned evaluator
            if (nextRule.isParallel && nextRule.approverRole === 'EVALUATOR') {
                const evaluators = await tx.select().from(schema.evaluatorAssignments)
                    .where(eq(schema.evaluatorAssignments.proposalId, proposalId));

                if (evaluators.length > 0) {
                    const insertVals = evaluators.map(ev => ({
                        proposalId,
                        routingRuleId: nextRule.id,
                        stepOrder: nextRule.stepOrder,
                        approverRole: nextRule.approverRole,
                        approverUserId: ev.evaluatorUserId, // Link specific evaluator immediately
                        decision: 'Pending' as const,
                        createdAt: new Date(),
                    }));
                    const newSteps = await tx.insert(schema.proposalApprovals).values(insertVals).returning();
                    return newSteps;
                } else {
                    // Fallback if no evaluators assigned, just create a general block
                    const [newStep] = await tx.insert(schema.proposalApprovals).values({
                        proposalId,
                        routingRuleId: nextRule.id,
                        stepOrder: nextRule.stepOrder,
                        approverRole: nextRule.approverRole,
                        decision: 'Pending',
                        createdAt: new Date(),
                    }).returning();
                    return newStep;
                }
            }

            // Standard sequential step (RAD, FINANCE, VPRTT, AC)
            const [newStep] = await tx.insert(schema.proposalApprovals).values({
                proposalId,
                routingRuleId: nextRule.id,
                stepOrder: nextRule.stepOrder,
                approverRole: nextRule.approverRole,
                decision: 'Pending',
                createdAt: new Date(),
            }).returning();

            return newStep;
        });
    }
}
