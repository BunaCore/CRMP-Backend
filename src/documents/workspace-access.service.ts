import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectsService } from 'src/projects/projects.service';
import { DocumentsRepository } from './documents.repository';

/**
 * Central place for editor access checks:
 * - workspace exists
 * - workspace belongs to a project
 * - user is a member of that project
 *
 * This is the shared foundation that both REST and future realtime collaboration can reuse.
 */
@Injectable()
export class WorkspaceAccessService {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly documentsRepository: DocumentsRepository,
  ) {}

  async resolveProjectIdForWorkspace(workspaceId: string): Promise<string> {
    const workspace =
      await this.documentsRepository.findWorkspaceById(workspaceId);
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace.projectId;
  }

  async ensureWorkspaceMember(params: { workspaceId: string; userId: string }) {
    const projectId = await this.resolveProjectIdForWorkspace(
      params.workspaceId,
    );
    const isMember = await this.projectsService.isUserMemberOfProject(
      params.userId,
      projectId,
    );
    if (!isMember) {
      throw new NotFoundException('Project not found');
    }
    return { projectId };
  }

  async ensureWorkspaceReader(params: { workspaceId: string; userId: string }) {
    const projectId = await this.resolveProjectIdForWorkspace(
      params.workspaceId,
    );
    const canRead = await this.projectsService.canReadProject(
      params.userId,
      projectId,
    );
    if (!canRead) {
      throw new NotFoundException('Project not found');
    }
    return { projectId };
  }

  async ensureProjectMember(params: { projectId: string; userId: string }) {
    const isMember = await this.projectsService.isUserMemberOfProject(
      params.userId,
      params.projectId,
    );
    if (!isMember) {
      throw new NotFoundException('Project not found');
    }
  }
}
