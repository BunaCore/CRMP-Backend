import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  NotFoundException,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Post,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from 'src/auth/decorators/current-user.decorator';
import { PublishProjectDto } from './dto';
import { GetProjectsQueryDto } from './dto/get-projects-query.dto';
import { UpdateProjectVisibilityDto } from './dto/update-project-visibility.dto';
import { UpdateProjectAssetsDto } from './dto/update-project-assets.dto';
import { CreateDefenceDto } from 'src/proposals/dto/create-defence.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async getMyProjects(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.getProjectsForUser(user.id);
  }

  @Get('all')
  async getAllProjects(
    @Query() query: GetProjectsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.getProjects(query, user.id);
  }

  @Get(':projectId/members')
  async getProjectMembers(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Check membership
    const isMember = await this.projectsService.isUserMemberOfProject(
      user.id,
      projectId,
    );
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
    const isMember = await this.projectsService.isUserMemberOfProject(
      user.id,
      projectId,
    );
    if (!isMember) {
      throw new NotFoundException('Project not found');
    }
    return this.projectsService.getProjectById(projectId);
  }

  @Get(':projectId/related')
  async getRelatedProjects(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query?: string,
  ) {
    // Check membership
    const isMember = await this.projectsService.isUserMemberOfProject(
      user.id,
      projectId,
    );
    if (!isMember) {
      throw new NotFoundException('Project not found');
    }
    return this.projectsService.getRelatedProjects(projectId, query);
  }

  @Get(':projectId/download-pdf')
  async downloadProjectPdf(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Res() res: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { buffer, filename } = await this.projectsService.downloadProjectPdf(projectId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Patch(':projectId/publish')
  @HttpCode(HttpStatus.OK)
  async publishProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PublishProjectDto,
  ) {
    return this.projectsService.publishProject(projectId, user.id, dto);
  }

  @Patch(':projectId/visibility')
  @HttpCode(HttpStatus.OK)
  async updateProjectVisibility(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProjectVisibilityDto,
  ) {
    return this.projectsService.updateProjectVisibility(
      projectId,
      user.id,
      dto,
    );
  }

  @Patch(':projectId/assets')
  @HttpCode(HttpStatus.OK)
  async updateProjectAssets(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProjectAssetsDto,
  ) {
    return this.projectsService.updateProjectAssets(projectId, user.id, dto);
  }

  @Post(':projectId/upload-banner')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async uploadBanner(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile()
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    },
  ) {
    return this.projectsService.uploadBanner(projectId, user.id, file);
  }

  @Post(':projectId/upload-public-file')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async uploadPublicFile(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile()
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    },
  ) {
    return this.projectsService.uploadPublicFile(projectId, user.id, file);
  }

  /**
   * POST /projects/:projectId/defence
   * Schedule a defence session for a project (project phase).
   *
   * Receives:
   *   { defenceDate: ISO string, location: string, note?: string }
   *
   * Returns:
   *   { success, message, defence: { id, projectId, defenceDate, location, note, scheduledBy, createdAt } }
   *
   * Scheduling rules:
   *   - Caller must be a member of the project.
   *   - Multiple defences are allowed (initial + rescheduled).
   *
   * The scheduled defence is embedded in GET /projects (getProjectsForUser)
   * under each project’s `defenceSchedules[]` array, which the
   * dashboard uses to render upcoming project-phase defence alerts.
   */
  @Post(':projectId/defence')
  @HttpCode(HttpStatus.CREATED)
  async scheduleDefence(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDefenceDto,
  ) {
    return this.projectsService.scheduleProjectDefence(projectId, user.id, dto);
  }

  /**
   * GET /projects/:projectId/defences
   * Fetch all defence schedules for a specific project.
   * Returns them sorted by defenceDate ASC.
   */
  @Get(':projectId/defences')
  async getProjectDefences(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isMember = await this.projectsService.isUserMemberOfProject(
      user.id,
      projectId,
    );
    if (!isMember) {
      throw new NotFoundException('Project not found');
    }
    return this.projectsService.repository.getProjectDefencesByProjectId(
      projectId,
    );
  }
}

@Controller('public/projects')
export class PublicProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async getPublicProjects() {
    return this.projectsService.getPublicProjects();
  }

  @Get(':projectId')
  async getPublicProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projectsService.getPublicProjectById(projectId);
  }
}
