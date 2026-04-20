import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { departments } from './department';

export const accountStatusEnum = pgEnum('account_status', [
  'active',
  'deactive',
  'suspended',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name'),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  department: text('department'),
  departmentId: uuid('department_id').references(() => departments.id),
  phoneNumber: text('phone_number'),
  university: text('university'),
  universityId: text('university_id'),
  isExternal: boolean('is_external').default(false),
  accountStatus: accountStatusEnum('account_status')
    .default('deactive')
    .notNull(),
  avatarUrl: text('avatar_url'), // URL to user's avatar/profile picture
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
