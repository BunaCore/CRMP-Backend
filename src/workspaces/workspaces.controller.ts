import { Controller, Get, Post, Patch, Body, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CurrentUser, type AuthenticatedUser } from 'src/auth/decorators/current-user.decorator';
import { CreateWorkspaceDto } from 'src/documents/dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get('projects/:projectId')
  async getWorkspacesForProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workspacesService.getWorkspacesForProject(projectId, user.id);
  }

  @Post('projects/:projectId')
  async createWorkspace(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateWorkspaceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workspacesService.createWorkspace(projectId, dto.name, user.id);
  }

  @Patch(':id')
  async updateWorkspace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkspaceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workspacesService.updateWorkspaceName(id, dto.name, user.id);
  }
}