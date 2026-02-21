import { pgEnum } from 'drizzle-orm/pg-core';
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const AccountStatusEnum = pgEnum('account_status', [
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
  phoneNumber: text('phone_number'),
  university: text('university'),
  universityId: text('university_id'),
  role: text('role').default('student').notNull(),
  accountStatus: AccountStatusEnum('account_status')
    .default('deactive')
    .notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
