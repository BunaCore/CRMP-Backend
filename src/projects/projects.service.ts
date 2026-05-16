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
import { sql, eq } from 'drizzle-orm';
import * as schema from 'src/db/schema';
import { DrizzleService } from 'src/db/db.service';
import { FilesService } from 'src/common/files/files.service';
import { MailService } from 'src/mail/mail.service';
import { EmailType } from 'src/mail/dto/email-type.enum';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  private static readonly requiredUploadFields = [
    'buffer',
    'originalname',
    'mimetype',
  ] as const;

  constructor(
    readonly repository: ProjectsRepository,
    private readonly abilityFactory: AbilityFactory,
    private readonly drizzle: DrizzleService,
    private readonly filesService: FilesService,
    private readonly mailService: MailService,
  ) {}

  async getProjectsForUser(userId: string) {
    const projects = await this.repository.findProjectsByUserId(userId);
    if (projects.length === 0) return [];

    // Bulk-fetch all defence schedules for these projects in one query
    const projectIds = projects.map((p) => p.projectId);
    const defencesMap =
      await this.repository.getProjectDefencesByProjectIds(projectIds);

    return projects.map((p) => ({
      ...p,
      defenceSchedules: (defencesMap.get(p.projectId) ?? []).map((d) => ({
        id: d.id,
        defenceDate: d.defenceDate?.toISOString(),
        location: d.location,
        note: d.note ?? null,
        scheduledBy: d.scheduledBy ?? null,
        createdAt: d.createdAt?.toISOString() ?? new Date().toISOString(),
      })),
    }));
  }

  async getProjectById(projectId: string) {
    const [project, members] = await Promise.all([
      this.repository.findProjectById(projectId),
      this.repository.getProjectMembersWithDetails(projectId),
    ]);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const [budget, defenceSchedules] = await Promise.all([
      this.repository.getProjectBudgetByProjectId(projectId),
      this.repository.getProjectDefencesByProjectId(projectId),
    ]);

    return {
      ...project,
      members,
      budget,
      defenceSchedules: defenceSchedules.map((d) => ({
        id: d.id,
        defenceDate: d.defenceDate?.toISOString(),
        location: d.location,
        note: d.note ?? null,
        scheduledBy: d.scheduledBy ?? null,
        createdAt: d.createdAt?.toISOString() ?? new Date().toISOString(),
      })),
    };
  }

  async isUserMemberOfProject(
    userId: string,
    projectId: string,
  ): Promise<boolean> {
    return this.repository.isUserMemberOfProject(userId, projectId);
  }

  async canReadProject(userId: string, projectId: string): Promise<boolean> {
    const isMember = await this.isUserMemberOfProject(userId, projectId);
    if (isMember) return true;

    // Check CASL ability — admin/coordinator/evaluator roles have ADMIN_VIEW
    // which grants 'access' on 'AdminDashboard'. We use this as a proxy
    // since PROJECT_READ is not always assigned to admin roles.
    const ability = await this.abilityFactory.createAbility(userId);
    const hasAdminAccess = ability.rules.some(
      (r) =>
        !r.inverted &&
        // Explicitly granted project read
        ((r.action === 'read' &&
          (r.subject === 'Project' || r.subject === 'all')) ||
          // Admin dashboard access — coordinators, evaluators, DGC, etc.
          (r.action === 'access' && r.subject === 'AdminDashboard') ||
          // Evaluation read — evaluators assigned to the project
          (r.action === 'read' && r.subject === 'Evaluation')),
    );
    return hasAdminAccess;
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

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Project Defence Scheduling
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Schedule a defence for a project (project phase).
   * Multiple defences per project are allowed (rescheduling).
   */
  async scheduleProjectDefence(
    projectId: string,
    scheduledBy: string,
    dto: { defenceDate: string; location: string; note?: string },
  ) {
    const project = await this.repository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const defence = await this.repository.createProjectDefence({
      projectId,
      scheduledBy,
      defenceDate: new Date(dto.defenceDate),
      location: dto.location,
      note: dto.note,
    });

    // Automatically update project stage to 'Under Review'
    await this.drizzle.db
      .update(schema.projects)
      .set({ projectStage: 'Under Review' })
      .where(eq(schema.projects.projectId, projectId));

    // Send email to all project members
    const members = await this.repository.getProjectMembers(projectId);
    for (const member of members) {
      if (member.email) {
        this.mailService
          .sendEmail(EmailType.DEFENSE_SCHEDULED, member.email, {
            recipientName: member.fullName || 'Member',
            proposalTitle: project.projectTitle, // The template calls it proposalTitle
            defenseDate: defence.defenceDate.toLocaleDateString(),
            defenseTime: defence.defenceDate.toLocaleTimeString(),
          })
          .catch((err) =>
            this.logger.error(
              `Failed to send email to ${member.email}: ${err.message}`,
            ),
          );
      }
    }

    return {
      success: true,
      message: 'Project defence scheduled successfully',
      defence: {
        id: defence.id,
        projectId: defence.projectId,
        defenceDate: defence.defenceDate?.toISOString(),
        location: defence.location,
        note: defence.note ?? null,
        scheduledBy: defence.scheduledBy ?? null,
        createdAt: defence.createdAt?.toISOString() ?? new Date().toISOString(),
      },
    };
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
