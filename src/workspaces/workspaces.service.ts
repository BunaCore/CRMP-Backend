import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkspacesRepository } from './workspaces.repository';
import { ProjectsService } from 'src/projects/projects.service';
import { TiptapValidator } from 'src/documents/tiptap-validator.service';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly repository: WorkspacesRepository,
    private readonly projectsService: ProjectsService,
    private readonly tiptapValidator: TiptapValidator,
  ) {}

  async getWorkspacesForProject(projectId: string, userId: string) {
    // Check if user is member of project
    const isMember = await this.projectsService.isUserMemberOfProject(userId, projectId);
    if (!isMember) {
      throw new NotFoundException('Project not found');
    }
    return this.repository.findWorkspacesByProject(projectId);
  }

  async updateWorkspaceName(id: string, name: string, userId: string) {
    const workspace = await this.repository.findWorkspaceById(id);
    if (!workspace) throw new NotFoundException('Workspace not found');

    const isMember = await this.projectsService.isUserMemberOfProject(userId, workspace.projectId);
    if (!isMember) throw new NotFoundException('Project not found');

    return this.repository.updateWorkspaceName(id, name);
  }

  async createWorkspace(projectId: string, name: string, userId: string) {
    // Check if user is member of project
    const isMember = await this.projectsService.isUserMemberOfProject(userId, projectId);
    if (!isMember) {
      throw new NotFoundException('Project not found');
    }

    // Check if project already has a workspace
    const existingWorkspaces = await this.repository.findWorkspacesByProject(projectId);
    if (existingWorkspaces.length > 0) {
      throw new BadRequestException('Project already has a workspace. Only one workspace per project is allowed.');
    }

    const workspace = await this.repository.createWorkspace(projectId, name, userId);

    // Create initial document
    const initialContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Start writing your document here...' }],
        },
      ],
    };
    const validatedContent = this.tiptapValidator.validateDocument(initialContent);
    const document = await this.repository.createInitialDocument(workspace.id, validatedContent);

    // Create initial version
    const version = await this.repository.createInitialVersion(document.id, validatedContent, userId);

    // Update document with current version
    await this.repository.updateDocumentWithVersion(document.id, validatedContent, version.id);

    return workspace;
  }
}