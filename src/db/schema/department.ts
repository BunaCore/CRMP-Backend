import { pgTable, varchar, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './user';

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  code: varchar('code', { length: 10 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const departmentCoordinators = pgTable('department_coordinators', {
  id: uuid('id').primaryKey().defaultRandom(),
  departmentId: uuid('department_id')
    .notNull()
    .references(() => departments.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
});
