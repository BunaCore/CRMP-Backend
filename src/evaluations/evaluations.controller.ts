import { Controller, Get, Post, Body, UseGuards, Param } from '@nestjs/common';
import { EvaluationsService } from './evaluations.service';
import { SubmitScoresDto } from './dto/submit-scores.dto';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AccessGuard } from 'src/access-control/access.guard';
import { RequirePermission } from 'src/access-control/require-permission.decorator';
import { Permission } from 'src/access-control/permission.enum';
import {
  CurrentUser,
  type AuthenticatedUser,
} from 'src/auth/decorators/current-user.decorator';

@Controller('evaluations')
@UseGuards(JwtAuthGuard, AccessGuard)
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Get('proposals')
  async getProposals(@CurrentUser() user: AuthenticatedUser) {
    return this.evaluationsService.getProposals(user);
  }

  @Get('projects')
  async getProjects(@CurrentUser() user: AuthenticatedUser) {
    return this.evaluationsService.getProjects(user);
  }

  @Post(':id/scores')
  @RequirePermission(Permission.EVALUATION_SUBMIT)
  async submitScores(
    @Param('id') proposalId: string,
    @Body() dto: SubmitScoresDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.evaluationsService.submitScores(proposalId, dto, user);
  }
}
