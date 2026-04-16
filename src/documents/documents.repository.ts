import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { eq, desc, and, sql, ne, notInArray } from 'drizzle-orm';

@Injectable()
export class DocumentsRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async createWorkspace(projectId: string, name: string, createdBy: string) {
    const [workspace] = await this.drizzle.db
      .insert(schema.workspaces)
      .values({ projectId, name, createdBy })
      .returning();
    return workspace;
  }

  async findWorkspacesByProject(projectId: string) {
    return this.drizzle.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.projectId, projectId))
      .orderBy(desc(schema.workspaces.createdAt));
  }

  async findWorkspaceById(id: string) {
    const [workspace] = await this.drizzle.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, id));
    return workspace;
  }

  async createDocument(workspaceId: string, content: any) {
    const [document] = await this.drizzle.db
      .insert(schema.documents)
      .values({ workspaceId, currentContent: content })
      .returning();
    return document;
  }

  async findDocumentByWorkspaceId(workspaceId: string) {
    const [document] = await this.drizzle.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.workspaceId, workspaceId));
    return document;
  }

  async updateDocument(id: string, content: any, currentVersionId?: string) {
    const updateData: any = { currentContent: content, updatedAt: sql`NOW()` };
    if (currentVersionId) {
      updateData.currentVersionId = currentVersionId;
    }
    const [document] = await this.drizzle.db
      .update(schema.documents)
      .set(updateData)
      .where(eq(schema.documents.id, id))
      .returning();
    return document;
  }

  async createDocumentVersion(
    documentId: string,
    versionNumber: number,
    content: any,
    createdBy: string,
    sourceAction: 'initial' | 'save' | 'autosave' | 'import' | 'restore',
    contentHash: string,
  ) {
    const [version] = await this.drizzle.db
      .insert(schema.documentVersions)
      .values({
        documentId,
        versionNumber,
        content,
        createdBy,
        sourceAction,
        contentHash,
      })
      .returning();
    return version;
  }

  async findLatestVersionByDocumentId(documentId: string) {
    const [version] = await this.drizzle.db
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, documentId))
      .orderBy(desc(schema.documentVersions.versionNumber))
      .limit(1);
    return version;
  }

  async isUserMemberOfProject(userId: string, projectId: string): Promise<boolean> {
    const [member] = await this.drizzle.db
      .select()
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, userId),
        ),
      );
    return !!member;
  }

  async findVersionById(id: string) {
    const [version] = await this.drizzle.db
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.id, id));
    return version;
  }

  async getNextVersionNumber(documentId: string): Promise<number> {
    const result = await this.drizzle.db
      .select({ maxVersion: sql<number>`MAX(${schema.documentVersions.versionNumber})` })
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, documentId));
    return (result[0]?.maxVersion || 0) + 1;
  }

  async findVersionsByDocumentId(documentId: string) {
    return this.drizzle.db
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, documentId))
      .orderBy(desc(schema.documentVersions.versionNumber));
  }

  async getProjectsForUser(userId: string) {
    return this.drizzle.db
      .select({
        id: schema.projects.projectId,
        title: schema.projects.projectTitle,
        stage: schema.projects.projectStage,
        createdAt: schema.projects.createdAt,
      })
      .from(schema.projects)
      .innerJoin(schema.projectMembers, eq(schema.projectMembers.projectId, schema.projects.projectId))
      .where(eq(schema.projectMembers.userId, userId));
  }

  /**
   * Prune autosave versions for a document, keeping:
   *   1. All non-autosave versions (initial, save, import, restore) — never deleted.
   *   2. The 30 most recent autosave versions unconditionally.
   *   3. For autosaves older than 30 days — only the most recent one per calendar day.
   *
   * Fired as void (fire-and-forget) after every autosave so it never slows the response.
   */
  async pruneAutosaveVersions(documentId: string): Promise<void> {
    // Step 1: Collect IDs of autosave versions to KEEP

    // Keep the 30 most recent autosaves
    const recentRows = await this.drizzle.db
      .select({ id: schema.documentVersions.id })
      .from(schema.documentVersions)
      .where(
        and(
          eq(schema.documentVersions.documentId, documentId),
          eq(schema.documentVersions.sourceAction, 'autosave'),
        ),
      )
      .orderBy(desc(schema.documentVersions.createdAt))
      .limit(30);

    const recentIds = recentRows.map((r) => r.id);

    // Keep one-per-day autosaves older than 30 days (the most recent one per calendar day)
    const oldDailyRows = await this.drizzle.db.execute(
      sql`
        SELECT DISTINCT ON (DATE(created_at)) id
        FROM document_versions
        WHERE document_id = ${documentId}
          AND source_action = 'autosave'
          AND created_at < NOW() - INTERVAL '30 days'
        ORDER BY DATE(created_at), created_at DESC
      `,
    );

    const oldDailyIds: string[] = (oldDailyRows.rows as { id: string }[]).map((r) => r.id);

    const keepIds = [...new Set([...recentIds, ...oldDailyIds])];

    // Step 2: Delete autosave versions NOT in the keep list
    if (keepIds.length > 0) {
      await this.drizzle.db
        .delete(schema.documentVersions)
        .where(
          and(
            eq(schema.documentVersions.documentId, documentId),
            eq(schema.documentVersions.sourceAction, 'autosave'),
            notInArray(schema.documentVersions.id, keepIds),
          ),
        );
    }
  }
}