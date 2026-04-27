import { pgTable, uuid, jsonb, timestamp, customType } from 'drizzle-orm/pg-core';
import { workspaces } from './workspace';
import { documentVersions } from './document_version';

const bytea = customType<{ data: Buffer | null }>({
  dataType() {
    return 'bytea';
  },
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  currentContent: jsonb('current_content').notNull(), // Tiptap JSON
  /**
   * Yjs document state (binary update) for realtime collaboration.
   * - When null: collaboration state hasn't been initialized yet.
   * - When set: this is an encoded Yjs update representing the full doc state.
   */
  yjsState: bytea('yjs_state'),
  currentVersionId: uuid('current_version_id').references(() => documentVersions.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});