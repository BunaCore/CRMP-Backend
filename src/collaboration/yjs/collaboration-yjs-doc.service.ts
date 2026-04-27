import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { CollaborationYjsRepository } from './collaboration-yjs.repository';

type DocEntry = {
  workspaceId: string;
  doc: Y.Doc;
  awareness: Awareness;
  lastAccessAt: number;
  refs: number;
  flushTimeout?: NodeJS.Timeout;
};

@Injectable()
export class CollaborationYjsDocService implements OnModuleDestroy {
  private readonly logger = new Logger(CollaborationYjsDocService.name);

  private readonly docs = new Map<string, DocEntry>(); // workspaceId -> entry

  // Idle eviction to prevent memory leaks in low-traffic workspaces
  private readonly idleTtlMs = 5 * 60_000;
  private readonly evictionIntervalMs = 60_000;
  private evictionTimer?: NodeJS.Timeout;

  // Persist state with a debounce to avoid DB write amplification
  private readonly persistDebounceMs = 2000;

  constructor(private readonly repo: CollaborationYjsRepository) {
    this.evictionTimer = setInterval(() => this.evictIdle(), this.evictionIntervalMs);
  }

  async acquire(workspaceId: string): Promise<DocEntry> {
    const existing = this.docs.get(workspaceId);
    if (existing) {
      existing.refs += 1;
      existing.lastAccessAt = Date.now();
      return existing;
    }

    const doc = new Y.Doc();
    const awareness = new Awareness(doc);

    // Load persisted state if it exists
    const persisted = await this.repo.getYjsStateByWorkspaceId(workspaceId);
    if (persisted && persisted.length > 0) {
      try {
        Y.applyUpdate(doc, persisted);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        this.logger.error(`Failed to apply persisted yjs_state: ${msg}`);
      }
    }

    const entry: DocEntry = {
      workspaceId,
      doc,
      awareness,
      lastAccessAt: Date.now(),
      refs: 1,
    };

    // Debounced persistence on any document update
    doc.on('update', () => {
      entry.lastAccessAt = Date.now();
      this.schedulePersist(entry);
    });

    this.docs.set(workspaceId, entry);
    return entry;
  }

  release(workspaceId: string) {
    const entry = this.docs.get(workspaceId);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    entry.lastAccessAt = Date.now();
  }

  private schedulePersist(entry: DocEntry) {
    if (entry.flushTimeout) clearTimeout(entry.flushTimeout);
    entry.flushTimeout = setTimeout(() => {
      void this.persist(entry.workspaceId);
    }, this.persistDebounceMs);
  }

  async persist(workspaceId: string): Promise<void> {
    const entry = this.docs.get(workspaceId);
    if (!entry) return;
    if (entry.flushTimeout) {
      clearTimeout(entry.flushTimeout);
      entry.flushTimeout = undefined;
    }

    const full = Y.encodeStateAsUpdate(entry.doc);
    await this.repo.setYjsStateByWorkspaceId(workspaceId, full);
  }

  private evictIdle() {
    const now = Date.now();
    for (const [workspaceId, entry] of this.docs.entries()) {
      const idle = now - entry.lastAccessAt;
      if (entry.refs === 0 && idle > this.idleTtlMs) {
        try {
          if (entry.flushTimeout) clearTimeout(entry.flushTimeout);
          // Best-effort persist on eviction
          void this.persist(workspaceId);
        } finally {
          entry.awareness.destroy();
          entry.doc.destroy();
          this.docs.delete(workspaceId);
        }
      }
    }
  }

  async onModuleDestroy() {
    if (this.evictionTimer) clearInterval(this.evictionTimer);
    const workspaceIds = Array.from(this.docs.keys());
    for (const wid of workspaceIds) {
      try {
        await this.persist(wid);
      } catch {
        // swallow
      }
    }
  }
}

export type { DocEntry };

