import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { AdminProjectsService } from './admin-projects.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from 'src/auth/decorators/current-user.decorator';
import { AccessGuard } from 'src/access-control/access.guard';
import { RequirePermission } from 'src/access-control/require-permission.decorator';
import { Permission } from 'src/access-control/permission.enum';
import { Role } from 'src/access-control/role.enum';

@Controller('admin/projects')
@UseGuards(JwtAuthGuard, AccessGuard)
export class AdminProjectsController {
  constructor(private readonly adminProjectsService: AdminProjectsService) {}

  @Get()
  @RequirePermission(Permission.ADMIN_VIEW)
  async getProjects(
    @Query() query: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminProjectsService.getAdminProjectsList(query, user.roles);
  }

  @Get(':id')
  @RequirePermission(Permission.ADMIN_VIEW)
  async getProjectDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminProjectsService.getAdminProjectDetail(
      id,
      user.id,
      user.roles,
    );
  }

  @Patch(':id/terminate')
  @RequirePermission(Permission.ADMIN_VIEW)
  async terminateProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.reason || body.reason.trim().length === 0) {
      throw new BadRequestException('Reason is mandatory for termination');
    }

    const hasAllowedRole = user.roles.some((r) =>
      [Role.COORDINATOR, Role.DGC_MEMBER, Role.ADRPM].includes(r as Role),
    );

    if (!hasAllowedRole) {
      throw new BadRequestException(
        'Forbidden: You do not have permission to terminate projects',
      );
    }

    return this.adminProjectsService.terminateProject(id, body.reason);
  }

  @Get(':id/export-pdf')
  @RequirePermission(Permission.ADMIN_VIEW)
  async exportPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const hasAllowedRole = user.roles.some((r) =>
      [Role.COORDINATOR, Role.DGC_MEMBER, Role.ADRPM].includes(r as Role),
    );

    if (!hasAllowedRole) {
      throw new BadRequestException(
        'Forbidden: You do not have permission to export projects as PDF',
      );
    }

    return this.adminProjectsService.exportProjectPdf(id);
  }
}
