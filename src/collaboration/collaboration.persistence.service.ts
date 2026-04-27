import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { DocumentsService } from 'src/documents/documents.service';

type PendingFlush = {
  projectId: string;
  workspaceId: string;
  lastUserId: string;
  latestContent: unknown;
  timeout: NodeJS.Timeout;
  firstScheduledAt: number;
};

@Injectable()
export class CollaborationPersistenceService implements OnModuleDestroy {
  private readonly logger = new Logger(CollaborationPersistenceService.name);

  private readonly pending = new Map<string, PendingFlush>(); // projectId -> pending flush

  // Keep these conservative to avoid hammering version history.
  private readonly debounceMs = 2000;
  private readonly maxFlushIntervalMs = 10000;

  constructor(private readonly documentsService: DocumentsService) {}

  recordUpdate(params: {
    projectId: string;
    workspaceId: string;
    userId: string;
    content: unknown;
  }) {
    const existing = this.pending.get(params.projectId);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    const now = Date.now();
    const firstScheduledAt = existing?.firstScheduledAt ?? now;
    const elapsed = now - firstScheduledAt;

    const delayMs =
      elapsed >= this.maxFlushIntervalMs
        ? 0
        : Math.min(this.debounceMs, this.maxFlushIntervalMs - elapsed);

    const timeout = setTimeout(() => {
      void this.flush(params.projectId);
    }, delayMs);

    this.pending.set(params.projectId, {
      projectId: params.projectId,
      workspaceId: params.workspaceId,
      lastUserId: params.userId,
      latestContent: params.content,
      timeout,
      firstScheduledAt,
    });
  }

  async flush(projectId: string): Promise<void> {
    const item = this.pending.get(projectId);
    if (!item) return;

    this.pending.delete(projectId);
    clearTimeout(item.timeout);

    try {
      await this.documentsService.saveDocument(
        item.workspaceId,
        { content: item.latestContent } as any,
        item.lastUserId,
        true, // autosave
      );
      this.logger.debug(
        `Flushed collab autosave for project ${projectId} (workspace ${item.workspaceId})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to flush collab autosave for project ${projectId}: ${msg}`,
      );

      // If access was revoked (or workspace/project no longer exists),
      // do NOT keep retrying indefinitely.
      if (err instanceof NotFoundException || err instanceof ForbiddenException) {
        return;
      }

      // Best-effort: keep the latest state queued so we can try again
      // on the next update / disconnect / shutdown flush.
      this.recordUpdate({
        projectId,
        workspaceId: item.workspaceId,
        userId: item.lastUserId,
        content: item.latestContent,
      });
    }
  }

  async onModuleDestroy() {
    const projectIds = Array.from(this.pending.keys());
    for (const projectId of projectIds) {
      await this.flush(projectId);
    }
  }
}

