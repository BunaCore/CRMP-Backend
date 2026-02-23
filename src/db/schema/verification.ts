import { pgTable, uuid, timestamp, text, varchar } from 'drizzle-orm/pg-core';
import { users } from './user';
import { proposalFiles } from './proposals';

export const verificationUploads = pgTable('verification_uploads', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id').notNull().references(() => proposalFiles.id),
    verificationStatus: varchar('verification_status', { length: 20 }).default('Pending'),  // Pending | Approved | Rejected
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    note: text('note'),
});
