import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';

@Injectable()
export class CollaborationYjsRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async getYjsStateByWorkspaceId(workspaceId: string): Promise<Uint8Array | null> {
    const [row] = await this.drizzle.db
      .select({ yjsState: schema.documents.yjsState })
      .from(schema.documents)
      .where(eq(schema.documents.workspaceId, workspaceId));

    const val = row?.yjsState as unknown;
    if (!val) return null;

    // pg driver returns bytea as Buffer
    if (Buffer.isBuffer(val)) return new Uint8Array(val);

    // Fallback for unexpected shapes
    if (val instanceof Uint8Array) return val;
    return null;
  }

  async setYjsStateByWorkspaceId(workspaceId: string, state: Uint8Array): Promise<void> {
    await this.drizzle.db
      .update(schema.documents)
      .set({ yjsState: Buffer.from(state) })
      .where(eq(schema.documents.workspaceId, workspaceId));
  }
}

