import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ProjectsRepository } from './projects.repository';
import { PublishProjectDto, PublicProjectDto } from './dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly repository: ProjectsRepository) {}

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
}
