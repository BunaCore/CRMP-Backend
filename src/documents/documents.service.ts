import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DocumentsRepository } from './documents.repository';
import { DrizzleService } from 'src/db/db.service';
import { TiptapValidator } from './tiptap-validator.service';
import { TiptapRenderer } from './tiptap-renderer.service';
import { MarkdownConverter } from './markdown-converter.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { SaveDocumentDto } from './dto/save-document.dto';
import { ImportMarkdownDto } from './dto/import-markdown.dto';
import { createHash } from 'crypto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly repository: DocumentsRepository,
    private readonly drizzle: DrizzleService,
    private readonly tiptapValidator: TiptapValidator,
    private readonly tiptapRenderer: TiptapRenderer,
    private readonly markdownConverter: MarkdownConverter,
  ) {}

  async createWorkspace(projectId: string, dto: CreateWorkspaceDto, createdBy: string) {
    return this.drizzle.transaction(async (tx) => {
      const workspace = await this.repository.createWorkspace(projectId, dto.name, createdBy);

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
      const document = await this.repository.createDocument(workspace.id, validatedContent);

      // Create initial version
      const contentHash = this.computeHash(validatedContent);
      const version = await this.repository.createDocumentVersion(
        document.id,
        1,
        validatedContent,
        createdBy,
        'initial',
        contentHash,
      );

      // Update document with current version
      await this.repository.updateDocument(document.id, validatedContent, version.id);

      this.logger.log(`Created workspace '${workspace.id}' with initial document '${document.id}'`);
      return workspace;
    });
  }

  async getWorkspaces(projectId: string) {
    return this.repository.findWorkspacesByProject(projectId);
  }

  async getProjectsForUser(userId: string) {
    return this.repository.getProjectsForUser(userId);
  }

  async getDocument(workspaceId: string) {
    const document = await this.repository.findDocumentByWorkspaceId(workspaceId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return {
      id: document.id,
      workspaceId: document.workspaceId,
      content: document.currentContent,
      updatedAt: document.updatedAt,
    };
  }

  async saveDocument(workspaceId: string, dto: SaveDocumentDto, userId: string, isAutosave = false) {
    // Validate Tiptap document structure
    const validatedContent = this.tiptapValidator.validateDocument(dto.content);

    return this.drizzle.transaction(async (tx) => {
      const document = await this.repository.findDocumentByWorkspaceId(workspaceId);
      if (!document) {
        throw new NotFoundException('Document not found');
      }

      const contentHash = this.computeHash(validatedContent);
      const latestVersion = await this.repository.findLatestVersionByDocumentId(document.id);

      if (latestVersion && latestVersion.contentHash === contentHash) {
        // No change, just update document updated_at
        const updated = await this.repository.updateDocument(document.id, validatedContent);
        return {
          document: {
            id: updated.id,
            workspaceId: updated.workspaceId,
            content: updated.currentContent,
            updatedAt: updated.updatedAt,
          },
          newVersion: null, // No new version
        };
      }

      // Create new version
      const nextVersionNumber = await this.repository.getNextVersionNumber(document.id);
      const action: 'initial' | 'save' | 'autosave' | 'import' | 'restore' = isAutosave ? 'autosave' : 'save';
      const version = await this.repository.createDocumentVersion(
        document.id,
        nextVersionNumber,
        validatedContent,
        userId,
        action,
        contentHash,
      );

      // Update document
      const updated = await this.repository.updateDocument(document.id, validatedContent, version.id);

      this.logger.log(`Document '${document.id}' saved (v${version.versionNumber}) by user '${userId}' [${action}]`);

      // Fire-and-forget: prune old autosave versions to keep history manageable.
      // Never awaited — runs in background and never blocks the save response.
      if (isAutosave) {
        void this.repository.pruneAutosaveVersions(document.id);
      }

      return {
        document: {
          id: updated.id,
          workspaceId: updated.workspaceId,
          content: updated.currentContent,
          updatedAt: updated.updatedAt,
        },
        newVersion: {
          id: version.id,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt,
          createdBy: version.createdBy,
          sourceAction: version.sourceAction,
          contentHash: version.contentHash,
        },
      };
    });
  }

  async getVersionDetail(workspaceId: string, versionId: string) {
    const document = await this.repository.findDocumentByWorkspaceId(workspaceId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const version = await this.repository.findVersionById(versionId);
    if (!version || version.documentId !== document.id) {
      throw new NotFoundException('Version not found');
    }

    return {
      id: version.id,
      versionNumber: version.versionNumber,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      sourceAction: version.sourceAction,
      contentHash: version.contentHash,
      content: version.content,
    };
  }

  async getVersions(workspaceId: string) {
    const document = await this.repository.findDocumentByWorkspaceId(workspaceId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    const versions = await this.repository.findVersionsByDocumentId(document.id);
    return versions.map(version => ({
      id: version.id,
      versionNumber: version.versionNumber,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      sourceAction: version.sourceAction,
      contentHash: version.contentHash,
    }));
  }

  async restoreVersion(workspaceId: string, versionId: string, userId: string) {
    return this.drizzle.transaction(async (tx) => {
      const document = await this.repository.findDocumentByWorkspaceId(workspaceId);
      if (!document) {
        throw new NotFoundException('Document not found');
      }

      const version = await this.repository.findVersionById(versionId);
      if (!version || version.documentId !== document.id) {
        throw new NotFoundException('Version not found');
      }

      // Validate restored content (should already be valid, but safety check)
      const validatedContent = this.tiptapValidator.validateDocument(version.content);
      const currentHash = this.computeHash(document.currentContent);
      if (currentHash === version.contentHash) {
        // Already at this version, no-op for idempotency
        return {
          document: {
            id: document.id,
            workspaceId: document.workspaceId,
            content: document.currentContent,
            updatedAt: document.updatedAt,
          },
          newVersion: null, // No new version created
        };
      }

      // Create new version with restored content
      const nextVersionNumber = await this.repository.getNextVersionNumber(document.id);
      const newVersion = await this.repository.createDocumentVersion(
        document.id,
        nextVersionNumber,
        validatedContent,
        userId,
        'restore',
        version.contentHash, // Same hash
      );

      // Update document
      const updatedDocument = await this.repository.updateDocument(document.id, validatedContent, newVersion.id);

      return {
        document: {
          id: updatedDocument.id,
          workspaceId: updatedDocument.workspaceId,
          content: updatedDocument.currentContent,
          updatedAt: updatedDocument.updatedAt,
        },
        newVersion: {
          id: newVersion.id,
          versionNumber: newVersion.versionNumber,
          createdAt: newVersion.createdAt,
          createdBy: newVersion.createdBy,
          sourceAction: newVersion.sourceAction,
          contentHash: newVersion.contentHash,
        },
      };
    });
  }

  async importMarkdown(workspaceId: string, dto: ImportMarkdownDto, userId: string) {
    return this.drizzle.transaction(async (tx) => {
      const document = await this.repository.findDocumentByWorkspaceId(workspaceId);
      if (!document) {
        throw new NotFoundException('Document not found');
      }

      const tiptapContent = this.markdownConverter.markdownToTiptap(dto.markdown);
      const validatedContent = this.tiptapValidator.validateDocument(tiptapContent);
      const contentHash = this.computeHash(validatedContent);

      const latestVersion = await this.repository.findLatestVersionByDocumentId(document.id);
      if (latestVersion && latestVersion.contentHash === contentHash) {
        // No change
        const updated = await this.repository.updateDocument(document.id, validatedContent);
        return {
          document: {
            id: updated.id,
            workspaceId: updated.workspaceId,
            content: updated.currentContent,
            updatedAt: updated.updatedAt,
          },
          newVersion: null,
        };
      }

      const nextVersionNumber = await this.repository.getNextVersionNumber(document.id);
      const version = await this.repository.createDocumentVersion(
        document.id,
        nextVersionNumber,
        validatedContent,
        userId,
        'import',
        contentHash,
      );

      const updated = await this.repository.updateDocument(document.id, validatedContent, version.id);

      return {
        document: {
          id: updated.id,
          workspaceId: updated.workspaceId,
          content: updated.currentContent,
          updatedAt: updated.updatedAt,
        },
        newVersion: {
          id: version.id,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt,
          createdBy: version.createdBy,
          sourceAction: version.sourceAction,
          contentHash: version.contentHash,
        },
      };
    });
  }

  async exportMarkdown(workspaceId: string): Promise<{ markdown: string; workspaceName: string }> {
    const workspace = await this.repository.findWorkspaceById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const document = await this.repository.findDocumentByWorkspaceId(workspaceId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const markdown = this.markdownConverter.tiptapToMarkdown(document.currentContent as any);
    return { markdown, workspaceName: workspace.name };
  }

  async exportPdf(workspaceId: string): Promise<{ buffer: Buffer; filename: string }> {
    const workspace = await this.repository.findWorkspaceById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const document = await this.repository.findDocumentByWorkspaceId(workspaceId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    try {
      const buffer = await this.tiptapRenderer.renderToPdf(
        document.currentContent as any,
        workspace.name,
      );
      // Sanitize workspace name for filename
      const safeName = workspace.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'document';
      return { buffer, filename: `${safeName}.pdf` };
    } catch (error) {
      this.logger.error(`Failed to generate PDF for workspace '${workspaceId}': ${(error as Error).message}`, (error as Error).stack);
      throw new BadRequestException('Failed to generate PDF: ' + (error as Error).message);
    }
  }

  private computeHash(content: any): string {
    const contentStr = JSON.stringify(content);
    return createHash('sha256').update(contentStr).digest('hex');
  }
}