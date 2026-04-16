import { Injectable, NotFoundException } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { eq, and } from 'drizzle-orm';
import { TiptapValidator } from 'src/documents/tiptap-validator.service';
import { createHash } from 'crypto';

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async findWorkspacesByProject(projectId: string) {
    return this.drizzle.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.projectId, projectId))
      .orderBy(schema.workspaces.createdAt);
  }

  async findWorkspaceById(id: string) {
    const [workspace] = await this.drizzle.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, id));
    return workspace;
  }

  async createWorkspace(projectId: string, name: string, createdBy: string) {
    const [workspace] = await this.drizzle.db
      .insert(schema.workspaces)
      .values({ projectId, name, createdBy })
      .returning();
    return workspace;
  }

  async updateWorkspaceName(id: string, name: string) {
    const [workspace] = await this.drizzle.db
      .update(schema.workspaces)
      .set({ name })
      .where(eq(schema.workspaces.id, id))
      .returning();
    return workspace;
  }

  async createInitialDocument(workspaceId: string, initialContent: any) {
    const [document] = await this.drizzle.db
      .insert(schema.documents)
      .values({ workspaceId, currentContent: initialContent })
      .returning();
    return document;
  }

  async createInitialVersion(documentId: string, content: any, createdBy: string) {
    const contentHash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    const [version] = await this.drizzle.db
      .insert(schema.documentVersions)
      .values({
        documentId,
        versionNumber: 1,
        content,
        createdBy,
        sourceAction: 'initial',
        contentHash,
      })
      .returning();
    return version;
  }

  async updateDocumentWithVersion(documentId: string, content: any, versionId: string) {
    const [document] = await this.drizzle.db
      .update(schema.documents)
      .set({ currentContent: content, currentVersionId: versionId })
      .where(eq(schema.documents.id, documentId))
      .returning();
    return document;
  }
}