import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './user';

export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roleName: varchar('role_name', { length: 50 }).notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow(),
  grantedBy: uuid('granted_by').references(() => users.id),
});
