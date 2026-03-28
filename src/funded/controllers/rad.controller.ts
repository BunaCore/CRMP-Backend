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
import { AssignmentService } from '../services/assignment.service';
import { FundedProposalRepository } from '../repositories/funded-proposal.repository';
import { AssignAdvisorDto } from '../dto/assign-advisor.dto';
import { AssignEvaluatorsDto } from '../dto/assign-evaluators.dto';
import { ReviewFundedDto } from '../dto/review-funded.dto';

@Controller('funded/rad')
@UseGuards(JwtAuthGuard, AccessGuard)
@RequirePermission(Permission.FUNDED_RAD_ACCESS)
export class RadController {
  constructor(
    private readonly workflowService: FundedWorkflowService,
    private readonly assignmentService: AssignmentService,
    private readonly proposalRepo: FundedProposalRepository,
  ) {}

  @Get('pending')
  async getPendingTriage() {
    return await this.proposalRepo.getPendingProposalsForRole('RAD');
  }

  @Post(':proposalId/assign-advisor')
  @RequirePermission(Permission.FUNDED_ASSIGN)
  async assignAdvisor(
    @Param('proposalId') proposalId: string,
    @Req() req,
    @Body() data: AssignAdvisorDto,
  ) {
    const userId = req.user.id;
    return await this.assignmentService.assignAdvisor(proposalId, userId, data);
  }

  @Post(':proposalId/assign-evaluators')
  @RequirePermission(Permission.FUNDED_ASSIGN)
  async assignEvaluators(
    @Param('proposalId') proposalId: string,
    @Req() req,
    @Body() data: AssignEvaluatorsDto,
  ) {
    const userId = req.user.id;
    return await this.assignmentService.assignEvaluators(
      proposalId,
      userId,
      data,
    );
  }

  @Post(':proposalId/review/:approvalId')
  @RequirePermission(Permission.FUNDED_DECIDE)
  async triageDecision(
    @Param('proposalId') proposalId: string,
    @Param('approvalId') approvalId: string,
    @Req() req,
    @Body() data: ReviewFundedDto,
  ) {
    const userId = req.user.id;
    // user.role should ideally be fetched from DB or JWT (using 'RAD' explicitly since this is the RAD controller)
    return await this.workflowService.processReview(
      proposalId,
      approvalId,
      userId,
      'RAD',
      data,
    );
  }
}
