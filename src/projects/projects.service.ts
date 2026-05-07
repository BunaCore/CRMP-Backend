import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ProjectsRepository } from './projects.repository';
import { PublishProjectDto, PublicProjectDto } from './dto';
import { GetProjectsQueryDto } from './dto/get-projects-query.dto';
import { AbilityFactory } from 'src/access-control/ability.factory';
import {
  buildProjectAuthorizationWhere,
  buildProjectRequestWhere,
  combineWithAnd,
} from './conditions/project.condition';
import { buildPaginationMeta } from 'src/common/pagination/utils/build-pagination-meta';
import { sql } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly repository: ProjectsRepository,
    private readonly abilityFactory: AbilityFactory,
    private readonly drizzle: DrizzleService,
  ) {}

  async getProjectsForUser(userId: string) {
    return this.repository.findProjectsByUserId(userId);
  }

  async getProjectById(projectId: string) {
    const project = await this.repository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
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

    // Return published project details
    return this.getPublicProjectById(projectId);
  }

  async getPublicProjects(): Promise<PublicProjectDto[]> {
    const projects = await this.repository.findPublicProjects();
    return projects.map((p) => this.mapToPublicProjectDto(p));
  }

  async getPublicProjectById(projectId: string): Promise<PublicProjectDto> {
    const project = await this.repository.findPublicProjectById(projectId);
    if (!project) {
      throw new NotFoundException('Public project not found');
    }
    return this.mapToPublicProjectDto(project);
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
}
