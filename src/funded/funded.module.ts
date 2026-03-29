import { Module } from '@nestjs/common';
import { RadController } from './controllers/rad.controller';
import { EvaluatorController } from './controllers/evaluator.controller';
import { ApproverController } from './controllers/approver.controller';
import { PiController } from './controllers/pi.controller';
import { FundedWorkflowService } from './services/funded-workflow.service';
import { AssignmentService } from './services/assignment.service';
import { FundedProposalRepository } from './repositories/funded-proposal.repository';
import { FundedRoutingRepository } from './repositories/funded-routing.repository';

@Module({
  controllers: [
    RadController,
    EvaluatorController,
    ApproverController,
    PiController,
  ],
  providers: [
    FundedWorkflowService,
    AssignmentService,
    FundedProposalRepository,
    FundedRoutingRepository,
  ],
})
export class FundedModule {}
