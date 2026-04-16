import { pgTable, uuid, jsonb, timestamp, text, integer, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { documents } from './document';
import { users } from './user';

export const sourceActionEnum = pgEnum('source_action', [
  'initial',
  'save',
  'autosave',
  'import',
  'restore',
]);

export const documentVersions = pgTable('document_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  content: jsonb('content').notNull(), // Tiptap JSON
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  sourceAction: sourceActionEnum('source_action').notNull(),
  contentHash: text('content_hash').notNull(), // SHA256 of JSON string
}, (table) => ({
  documentVersionUnq: unique('document_version_unq').on(table.documentId, table.versionNumber),
  documentIdIdx: index('document_id_idx').on(table.documentId),
}));