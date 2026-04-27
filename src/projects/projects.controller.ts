import { Controller, Get, Param, ParseUUIDPipe, UseGuards, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CurrentUser, type AuthenticatedUser } from 'src/auth/decorators/current-user.decorator';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async getMyProjects(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.getProjectsForUser(user.id);
  }

  @Get(':projectId/members')
  async getProjectMembers(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Check membership
    const isMember = await this.projectsService.isUserMemberOfProject(user.id, projectId);
    if (!isMember) {
      throw new NotFoundException('Project not found');
    }
    return this.projectsService.getProjectMembers(projectId);
  }

  @Get(':projectId')
  async getProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Check membership
    const isMember = await this.projectsService.isUserMemberOfProject(user.id, projectId);
    if (!isMember) {
      throw new NotFoundException('Project not found');
    }
    return this.projectsService.getProjectById(projectId);
  }
}