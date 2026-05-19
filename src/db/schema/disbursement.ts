import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  numeric,
  text,
  varchar,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './user';
import { projects } from './project';
import { files } from './files';

// --- Enums ---
export const budgetItemStatusEnum = pgEnum('budget_item_status', [
  'AVAILABLE',
  'PENDING_DISBURSEMENT',
  'PAID',
]);

export const disbursementStatusEnum = pgEnum('disbursement_status', [
  'PENDING',
  'RETURNED',
  'RESUBMITTED',
  'PAID',
  'REJECTED',
]);

// --- Table 1: project_budget_items ---
// Seeded once when a project is approved. These are the locked, approved
// line items the PI can select from when requesting funds.
export const projectBudgetItems = pgTable('project_budget_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.projectId, { onDelete: 'cascade' }),
  description: varchar('description', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  status: budgetItemStatusEnum('status').default('AVAILABLE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// --- Table 2: disbursement_requests ---
// Each time a PI selects items and submits, one record is created here.
export const disbursementRequests = pgTable('disbursement_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.projectId, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  requestSequence: integer('request_sequence').notNull(), // 1 for first, 2 for second, etc.
  totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).notNull(),
  status: disbursementStatusEnum('status').default('PENDING').notNull(),
  // Clearance doc (required for sequence > 1)
  clearanceFileId: uuid('clearance_file_id').references(() => files.id, {
    onDelete: 'set null',
  }),
  // Finance action fields
  bankTransactionId: varchar('bank_transaction_id', { length: 100 }),
  financeApprovedBy: uuid('finance_approved_by').references(() => users.id),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  // Return/correction fields
  financeFeedback: text('finance_feedback'),
  returnedBy: uuid('returned_by').references(() => users.id),
  returnedAt: timestamp('returned_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// --- Table 3: disbursement_request_items ---
// Junction table: which budget items are included in which disbursement request.
export const disbursementRequestItems = pgTable('disbursement_request_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  disbursementRequestId: uuid('disbursement_request_id')
    .notNull()
    .references(() => disbursementRequests.id, { onDelete: 'cascade' }),
  budgetItemId: uuid('budget_item_id')
    .notNull()
    .references(() => projectBudgetItems.id),
});
