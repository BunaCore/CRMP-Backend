import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './user';
import { proposals } from './proposals';
import { projects } from './project';

export const notificationTypeEnum = pgEnum('notification_type', [
  'Submission',
  'Assigned',
  'Decision',
  'Comment',
  'Revision_Required',
  'Budget_Released',
  'Workspace_Unlocked',
  'Examiner_Assigned',
]);
export const auditActionEnum = pgEnum('audit_action', [
  'CREATED',
  'STATUS_CHANGED',
  'DECISION_MADE',
  'BUDGET_RELEASED',
  'WORKSPACE_UNLOCKED',
  'EVALUATOR_ASSIGNED',
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientUserId: uuid('recipient_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  senderUserId: uuid('sender_user_id').references(() => users.id),
  type: notificationTypeEnum('type').notNull(),
  context: jsonb('context'),
  title: varchar('title', { length: 255 }),
  body: text('body'),
  proposalId: uuid('proposal_id').references(() => proposals.id),
  projectId: uuid('project_id').references(() => projects.projectId),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: auditActionEnum('action').notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
