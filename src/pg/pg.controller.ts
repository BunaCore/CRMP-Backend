import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PgService } from './pg.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AccessGuard } from 'src/access-control/access.guard';
import { RequirePermission } from 'src/access-control/require-permission.decorator';
import { Permission } from 'src/access-control/permission.enum';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/auth/decorators/current-user.decorator';
import { PgDecisionDto } from './dto/decision.dto';

/**
 * PgController
 *
 * Base route: /pg
 */
@Controller('pg')
@UseGuards(JwtAuthGuard, AccessGuard)
export class PgController {
  constructor(private readonly pgService: PgService) {}

  @Get('proposals')
  @RequirePermission(Permission.PROJECT_REVIEW)
  async getProposals(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.pgService.getProposals(user, { status, search });
  }

  @Get('proposals/:id')
  @RequirePermission(Permission.PROJECT_REVIEW)
  async getProposalDetail(
    @CurrentUser() _user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) proposalId: string,
  ) {
    return this.pgService.getProposalDetail(proposalId);
  }

  @Patch('proposals/:id/decision')
  @RequirePermission([Permission.PROJECT_APPROVE, Permission.PROJECT_REJECT])
  async makeDecision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) proposalId: string,
    @Body() dto: PgDecisionDto,
  ) {
    return this.pgService.makeDecision(user, proposalId, dto);
  }
}
