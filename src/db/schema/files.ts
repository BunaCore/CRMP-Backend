import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  bigint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './user';

export const fileStatusEnum = pgEnum('file_status', ['TEMP', 'ATTACHED']);

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  storagePath: varchar('storage_path', { length: 500 }).notNull(),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id, { onDelete: 'set null' }),

  // Resource context
  resourceType: varchar('resource_type', { length: 50 }), // 'PROPOSAL', 'STEP', etc
  resourceId: uuid('resource_id'), // proposal or step ID

  // Usage context
  purpose: varchar('purpose', { length: 50 }), // 'FORM_FIELD', 'ATTACHMENT', etc

  // File metadata
  originalName: varchar('original_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),

  // Status
  status: fileStatusEnum('status').default('TEMP'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type File = typeof files.$inferSelect;
export type CreateFileInput = typeof files.$inferInsert;
