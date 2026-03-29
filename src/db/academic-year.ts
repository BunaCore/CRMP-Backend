import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const academicYears = pgTable('academic_years', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  year: varchar('year', { length: 9 }).notNull().unique(), // e.g., "2023-2024"
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
