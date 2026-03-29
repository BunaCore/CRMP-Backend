import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { AccessGuard } from '../../access-control/access.guard';
import { RequirePermission } from '../../access-control/require-permission.decorator';
import { Permission } from '../../access-control/permission.enum';
import { FundedWorkflowService } from '../services/funded-workflow.service';
import { FundedProposalRepository } from '../repositories/funded-proposal.repository';
import { ReviewFundedDto } from '../dto/review-funded.dto';

@Controller('funded/evaluator')
@UseGuards(JwtAuthGuard, AccessGuard)
@RequirePermission(Permission.FUNDED_EVALUATOR_ACCESS)
export class EvaluatorController {
  constructor(
    private readonly workflowService: FundedWorkflowService,
    private readonly proposalRepo: FundedProposalRepository,
  ) {}

  @Get('pending')
  async getPendingEvaluations() {
    return await this.proposalRepo.getPendingProposalsForRole('EVALUATOR');
  }

  @Post(':proposalId/review/:approvalId')
  @RequirePermission(Permission.FUNDED_DECIDE)
  async submitEvaluation(
    @Param('proposalId') proposalId: string,
    @Param('approvalId') approvalId: string,
    @Req() req,
    @Body() data: ReviewFundedDto,
  ) {
    const userId = req.user.id;
    // user.role is enforced as 'EVALUATOR' by the architecture
    return await this.workflowService.processReview(
      proposalId,
      approvalId,
      userId,
      'EVALUATOR',
      data,
    );
  }
}
