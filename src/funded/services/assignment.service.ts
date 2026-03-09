import { Injectable } from '@nestjs/common';
import { DrizzleService } from '../../db/db.service';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { FundedProposalRepository } from '../repositories/funded-proposal.repository';
import { AssignAdvisorDto } from '../dto/assign-advisor.dto';
import { AssignEvaluatorsDto } from '../dto/assign-evaluators.dto';

@Injectable()
export class AssignmentService {
    constructor(
        private readonly dbService: DrizzleService,
        private readonly proposalRepo: FundedProposalRepository,
    ) { }

    /**
     * RAD dynamically attaches an Advisor to the proposal.
     */
    async assignAdvisor(proposalId: string, assignedById: string, data: AssignAdvisorDto) {
        return await this.dbService.db.update(schema.proposals)
            .set({
                advisorUserId: data.advisorId,
                updatedAt: new Date()
            })
            .where(eq(schema.proposals.id, proposalId))
            .returning();
    }

    /**
     * RAD maps Evaluators to the proposal. Usually, this means making evaluatorAssignment rows.
     */
    async assignEvaluators(proposalId: string, assignedById: string, data: AssignEvaluatorsDto) {
        return await this.proposalRepo.assignEvaluators(proposalId, assignedById, data.evaluatorIds);
    }
}
