import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ProjectsRepository } from './projects.repository';
import { PublishProjectDto, PublicProjectDto } from './dto';
import { GetProjectsQueryDto } from './dto/get-projects-query.dto';
import { UpdateProjectVisibilityDto } from './dto/update-project-visibility.dto';
import { UpdateProjectAssetsDto } from './dto/update-project-assets.dto';
import { AbilityFactory } from 'src/access-control/ability.factory';
import {
  buildProjectAuthorizationWhere,
  buildProjectRequestWhere,
  combineWithAnd,
} from './conditions/project.condition';
import { buildPaginationMeta } from 'src/common/pagination/utils/build-pagination-meta';
import { sql } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { FilesService } from 'src/common/files/files.service';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import {
  AuditAction,
  AuditActionValue,
} from 'src/audit-logs/types/audit-action.enum';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  private static readonly requiredUploadFields = [
    'buffer',
    'originalname',
    'mimetype',
  ] as const;

  constructor(
    private readonly repository: ProjectsRepository,
    private readonly abilityFactory: AbilityFactory,
    private readonly drizzle: DrizzleService,
    private readonly filesService: FilesService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async getProjectsForUser(userId: string) {
    return this.repository.findProjectsByUserId(userId);
  }

  async getProjectById(projectId: string) {
    const [project, members] = await Promise.all([
      this.repository.findProjectById(projectId),
      this.repository.getProjectMembersWithDetails(projectId),
    ]);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const budget = await this.repository.getProjectBudgetByProjectId(projectId);

    return {
      ...project,
      members,
      budget,
    };
  }

  async isUserMemberOfProject(
    userId: string,
    projectId: string,
  ): Promise<boolean> {
    return this.repository.isUserMemberOfProject(userId, projectId);
  }

  async getProjectMembers(projectId: string) {
    return this.repository.getProjectMembers(projectId);
  }

  async publishProject(
    projectId: string,
    userId: string,
    dto: PublishProjectDto,
  ): Promise<PublicProjectDto> {
    // Verify project exists
    const project = await this.repository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Verify user is PI of the project
    const isPI = await this.repository.isUserPIOfProject(userId, projectId);
    if (!isPI) {
      throw new ForbiddenException('Only project PI can publish this project');
    }

    // Update project to public
    await this.repository.updateProjectPublish(projectId, userId, {
      isPublic: true,
      publicFileUrl: dto.publicFileUrl,
      bannerUrl: dto.bannerUrl,
    });

    void this.logAudit({
      actorUserId: userId,
      action: AuditAction.STATUS_CHANGED,
      entityType: 'projects',
      entityId: projectId,
      metadata: {
        operation: 'PUBLISH_PROJECT',
        publicFileUrl: dto.publicFileUrl,
        bannerUrl: dto.bannerUrl ?? null,
      },
    });

    // Return published project details
    return this.getPublicProjectById(projectId);
  }

  async getPublicProjects(): Promise<PublicProjectDto[]> {
    const projects = await this.repository.findPublicProjects();
    return projects.map((p) => this.mapToPublicProjectDto(p));
  }

  async getPublicProjectById(projectId: string): Promise<PublicProjectDto> {
    const [project, members] = await Promise.all([
      this.repository.findPublicProjectById(projectId),
      this.repository.getProjectMembersWithDetails(projectId),
    ]);
    if (!project) {
      throw new NotFoundException('Public project not found');
    }

    const budget = await this.repository.getProjectBudgetByProjectId(projectId);

    return {
      ...this.mapToPublicProjectDto(project),
      members,
      budget,
    };
  }

  private mapToPublicProjectDto(project: any): PublicProjectDto {
    return {
      projectId: project.projectId,
      projectTitle: project.projectTitle,
      projectDescription: project.projectDescription,
      researchArea: project.researchArea,
      bannerUrl: project.bannerUrl,
      publicFileUrl: project.publicFileUrl,
      projectProgram: project.projectProgram,
      department: project.department,
      departmentId: project.departmentId,
      publishedAt: project.publishedAt,
      durationMonths: project.durationMonths,
    };
  }

  async getProjects(query: GetProjectsQueryDto, userId: string) {
    // 1. Get user ability for authorization rules
    const ability = await this.abilityFactory.createAbility(userId);

    // 2. Build WHERE clause from authorization rules
    const authWhere = buildProjectAuthorizationWhere(
      this.drizzle.db,
      ability,
      userId,
    );
    if (authWhere === sql`1 = 0`) {
      this.logger.debug(
        { userId },
        'User has no project read permissions (auth rules blocked)',
      );
      return {
        data: [],
        pagination: {
          page: query.page || 1,
          limit: query.limit || 10,
          total: 0,
          pages: 0,
        },
      };
    }

    // 3. Build WHERE clause from request query parameters
    const requestWhere = buildProjectRequestWhere(
      this.drizzle.db,
      query,
      userId,
    );

    // 4. Combine both conditions with AND
    const where = combineWithAnd([authWhere, requestWhere]);

    // 5. Log the action
    this.logger.debug(
      {
        userId,
        query,
        authWhere: String(authWhere),
        requestWhere: String(requestWhere),
        where: String(where),
      },
      'Fetching projects with filters',
    );

    // 6. Execute paginated query using shared pagination meta
    const page = query.page || 1;
    const limit = query.limit || 10;
    const result = await this.repository.getProjects(where, { page, limit });

    return {
      items: result.data,
      meta: buildPaginationMeta(page, limit, result.pagination.total),
    };
  }

  async updateProjectVisibility(
    projectId: string,
    userId: string,
    dto: UpdateProjectVisibilityDto,
  ): Promise<{ isPublic: boolean }> {
    // Verify project exists and user is PI
    const project = await this.repository.findProjectById(projectId);
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const isPI = await this.repository.isUserPIOfProject(userId, projectId);
    if (!isPI) {
      throw new ForbiddenException('Only project PI can update visibility');
    }

    // Update visibility
    await this.repository.updateProjectVisibility(projectId, dto.isPublic);

    void this.logAudit({
      actorUserId: userId,
      action: AuditAction.STATUS_CHANGED,
      entityType: 'projects',
      entityId: projectId,
      metadata: {
        operation: 'UPDATE_PROJECT_VISIBILITY',
        isPublic: dto.isPublic,
      },
    });

    return { isPublic: dto.isPublic };
  }

  async updateProjectAssets(
    projectId: string,
    userId: string,
    dto: UpdateProjectAssetsDto,
  ): Promise<{ bannerUrl?: string | null; publicFileUrl?: string | null }> {
    // Verify project exists and user is PI
    const project = await this.repository.findProjectById(projectId);
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const isPI = await this.repository.isUserPIOfProject(userId, projectId);
    if (!isPI) {
      throw new ForbiddenException('Only project PI can update assets');
    }

    // Update assets with fallback to existing values
    const bannerUrl = dto.bannerUrl ?? project.bannerUrl;
    const publicFileUrl = dto.publicFileUrl ?? project.publicFileUrl;

    await this.repository.updateProjectAssets(projectId, {
      bannerUrl: bannerUrl ?? undefined,
      publicFileUrl: publicFileUrl ?? undefined,
    });

    void this.logAudit({
      actorUserId: userId,
      action: AuditAction.UPDATED,
      entityType: 'projects',
      entityId: projectId,
      metadata: {
        operation: 'UPDATE_PROJECT_ASSETS',
        bannerUrl,
        publicFileUrl,
      },
    });

    return { bannerUrl, publicFileUrl };
  }

  async uploadBanner(
    projectId: string,
    userId: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    },
  ): Promise<{ fileId: string; url: string }> {
    this.ensureUploadFile(file);

    // Verify project exists and user is PI
    const project = await this.repository.findProjectById(projectId);
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const isPI = await this.repository.isUserPIOfProject(userId, projectId);
    if (!isPI) {
      throw new ForbiddenException('Only project PI can upload banner');
    }

    // Upload and attach file
    const result = await this.filesService.uploadAndAttachPublicFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      'PROJECT_BANNER',
      projectId,
      userId,
    );

    // Update project with fileId and URL
    await this.repository.updateProjectAssets(projectId, {
      bannerFileId: result.fileId,
      bannerUrl: result.url,
    });

    void this.logAudit({
      actorUserId: userId,
      action: AuditAction.CREATED,
      entityType: 'files',
      entityId: result.fileId,
      metadata: {
        operation: 'UPLOAD_PROJECT_BANNER',
        projectId,
        url: result.url,
      },
    });

    return result;
  }

  async uploadPublicFile(
    projectId: string,
    userId: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    },
  ): Promise<{ fileId: string; url: string }> {
    this.ensureUploadFile(file);

    // Verify project exists and user is PI
    const project = await this.repository.findProjectById(projectId);
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const isPI = await this.repository.isUserPIOfProject(userId, projectId);
    if (!isPI) {
      throw new ForbiddenException('Only project PI can upload public file');
    }

    // Upload and attach file
    const result = await this.filesService.uploadAndAttachPublicFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      'PROJECT_FILE',
      projectId,
      userId,
    );

    // Update project with fileId and URL
    await this.repository.updateProjectAssets(projectId, {
      publicFileId: result.fileId,
      publicFileUrl: result.url,
    });

    void this.logAudit({
      actorUserId: userId,
      action: AuditAction.CREATED,
      entityType: 'files',
      entityId: result.fileId,
      metadata: {
        operation: 'UPLOAD_PROJECT_FILE',
        projectId,
        url: result.url,
      },
    });

    return result;
  }

  private async logAudit(input: {
    actorUserId?: string | null;
    action: AuditActionValue;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, any> | null;
  }) {
    try {
      await this.auditLogsService.record(input);
    } catch (error) {
      this.logger.warn(
        `Failed to record audit log for ${input.entityType}/${input.entityId ?? 'n/a'}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private ensureUploadFile(file: unknown): asserts file is {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  } {
    if (!file || typeof file !== 'object') {
      throw new BadRequestException('File is required');
    }

    for (const field of ProjectsService.requiredUploadFields) {
      if (!(field in file)) {
        throw new BadRequestException('Invalid uploaded file payload');
      }
    }
  }
}
