import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectsRepository } from './projects.repository';

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

  async isUserMemberOfProject(userId: string, projectId: string): Promise<boolean> {
    return this.repository.isUserMemberOfProject(userId, projectId);
  }

  async getProjectMembers(projectId: string) {
    return this.repository.getProjectMembers(projectId);
  }
}