import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { AccessGuard } from '../../access-control/access.guard';
import { RequirePermission } from '../../access-control/require-permission.decorator';
import { Permission } from '../../access-control/permission.enum';
import { FundedWorkflowService } from '../services/funded-workflow.service';
import { SubmitFundedDto } from '../dto/submit-funded.dto';

@Controller('funded/pi')
@UseGuards(JwtAuthGuard, AccessGuard)
@RequirePermission(Permission.FUNDED_SUBMIT) // Strictly isolated
export class PiController {
  constructor(private readonly workflowService: FundedWorkflowService) {}

  @Post('submit')
  async submitProposal(@Req() req, @Body() data: SubmitFundedDto) {
    const userId = req.user.id;
    return await this.workflowService.submitProposal(userId, data);
  }
}
