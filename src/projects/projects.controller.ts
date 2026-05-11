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
