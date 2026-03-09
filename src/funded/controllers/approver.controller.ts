import { Controller, Get, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { AccessGuard } from '../../access-control/access.guard';
import { RequirePermission } from '../../access-control/require-permission.decorator';
import { Permission } from '../../access-control/permission.enum';
import { FundedWorkflowService } from '../services/funded-workflow.service';
import { FundedProposalRepository } from '../repositories/funded-proposal.repository';
import { ReviewFundedDto } from '../dto/review-funded.dto';

@Controller('funded/approver')
@UseGuards(JwtAuthGuard, AccessGuard)
@RequirePermission(Permission.FUNDED_APPROVER_ACCESS)
export class ApproverController {
    constructor(
        private readonly workflowService: FundedWorkflowService,
        private readonly proposalRepo: FundedProposalRepository,
    ) { }

    @Get('pending')
    async getPendingApprovals(@Req() req) {
        const roleName = req.user.role; // This controller is general (Finance, VPRTT, AC)
        return await this.proposalRepo.getPendingProposalsForRole(roleName);
    }

    @Post(':proposalId/review/:approvalId')
    @RequirePermission(Permission.FUNDED_DECIDE)
    async submitApproval(
        @Param('proposalId') proposalId: string,
        @Param('approvalId') approvalId: string,
        @Req() req,
        @Body() data: ReviewFundedDto
    ) {
        const userId = req.user.id;
        const userRole = req.user.role; // Must extract their specific role for workflow enforcement
        return await this.workflowService.processReview(proposalId, approvalId, userId, userRole, data);
    }
}
