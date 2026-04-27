import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectsService } from 'src/projects/projects.service';
import { DocumentsRepository } from './documents.repository';
import { TiptapValidator } from './tiptap-validator.service';
import { DrizzleService } from 'src/db/db.service';
import { createHash } from 'crypto';

/**
 * Single source of truth for workspace creation/listing used by:
 * - `WorkspacesController` (canonical routes)
 * - `DocumentsController` (legacy/duplicate routes kept for compatibility)
 */
@Injectable()
export class WorkspaceManagerService {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly repository: DocumentsRepository,
    private readonly drizzle: DrizzleService,
    private readonly tiptapValidator: TiptapValidator,
  ) {}

  async getWorkspacesForProject(projectId: string, userId: string) {
    const isMember = await this.projectsService.isUserMemberOfProject(userId, projectId);
    if (!isMember) throw new NotFoundException('Project not found');
    return this.repository.findWorkspacesByProject(projectId);
  }

  async createWorkspace(projectId: string, name: string, userId: string) {
    const isMember = await this.projectsService.isUserMemberOfProject(userId, projectId);
    if (!isMember) throw new NotFoundException('Project not found');

    const existing = await this.repository.findWorkspacesByProject(projectId);
    if (existing.length > 0) {
      throw new BadRequestException(
        'Project already has a workspace. Only one workspace per project is allowed.',
      );
    }

    return this.drizzle.transaction(async () => {
      const workspace = await this.repository.createWorkspace(projectId, name, userId);

      const initialContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Start writing your document here...' },
            ],
          },
        ],
      };

      const validatedContent = this.tiptapValidator.validateDocument(initialContent);
      const document = await this.repository.createDocument(workspace.id, validatedContent);

      const contentHash = createHash('sha256')
        .update(JSON.stringify(validatedContent))
        .digest('hex');

      const version = await this.repository.createDocumentVersion(
        document.id,
        1,
        validatedContent,
        userId,
        'initial',
        contentHash,
      );

      await this.repository.updateDocument(document.id, validatedContent, version.id);
      return workspace;
    });
  }
}

