import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { workspaces } from './workspace';
import { documentVersions } from './document_version';

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  currentContent: jsonb('current_content').notNull(), // Tiptap JSON
  currentVersionId: uuid('current_version_id').references(() => documentVersions.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});