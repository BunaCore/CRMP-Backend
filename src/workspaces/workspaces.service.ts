import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkspacesRepository } from './workspaces.repository';
import { ProjectsService } from 'src/projects/projects.service';
import { TiptapValidator } from 'src/documents/tiptap-validator.service';
import { WorkspaceManagerService } from 'src/documents/workspace-manager.service';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly repository: WorkspacesRepository,
    private readonly projectsService: ProjectsService,
    private readonly tiptapValidator: TiptapValidator,
    private readonly workspaceManager: WorkspaceManagerService,
  ) {}

  async getWorkspacesForProject(projectId: string, userId: string) {
    return this.workspaceManager.getWorkspacesForProject(projectId, userId);
  }

  async updateWorkspaceName(id: string, name: string, userId: string) {
    const workspace = await this.repository.findWorkspaceById(id);
    if (!workspace) throw new NotFoundException('Workspace not found');

    const isMember = await this.projectsService.isUserMemberOfProject(userId, workspace.projectId);
    if (!isMember) throw new NotFoundException('Project not found');

    return this.repository.updateWorkspaceName(id, name);
  }

  async createWorkspace(projectId: string, name: string, userId: string) {
    return this.workspaceManager.createWorkspace(projectId, name, userId);
  }
}