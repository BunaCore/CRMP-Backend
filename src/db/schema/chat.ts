import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { users } from './user';
import { projects } from './project';

/**
 * Chat types: 'group' = project-based chat, 'dm' = direct message between 2 users
 */
export const chatTypeEnum = pgEnum('chat_type', ['group', 'dm']);

/**
 * Chats table: stores chat rooms (both group project chats and 1:1 DMs)
 * - type='group': projectId is set, name = project name
 * - type='dm': projectId is null, name is null (derived from members)
 */
export const chats = pgTable('chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: chatTypeEnum('type').notNull(),
  name: text('name'), // Only for group chats
  projectId: uuid('project_id').references(() => projects.projectId, {
    onDelete: 'set null',
  }), // Only for group chats
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * Chat members: tracks who is in which chat
 * Many-to-many relationship between chats and users
 */
export const chatMembers = pgTable(
  'chat_members',
  {
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chatId, t.userId] }),
  }),
);

/**
 * Messages table: stores all chat messages
 */
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
