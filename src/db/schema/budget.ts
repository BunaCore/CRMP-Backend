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
import { proposalStatusEnum, proposals } from './proposals';
import { projects } from './project';

export const fundReleaseStatusEnum = pgEnum('fund_release_status', [
  'Pending',
  'Released',
  'Cancelled',
]);
export const installmentTriggerEnum = pgEnum('installment_trigger', [
  'Auto',
  'Manual',
]);

export const budgetRequests = pgTable('budget_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id').references(() => proposals.id, {
    onDelete: 'set null',
  }),
  projectId: uuid('project_id').references(() => projects.projectId),
  requestedBy: uuid('requested_by').references(() => users.id),
  currentStatus: proposalStatusEnum('current_status').default('Submitted'),
  totalAmount: numeric('total_amount', { precision: 15, scale: 2 }),
  approvedAmount: numeric('approved_amount', { precision: 15, scale: 2 }),
  financeApprovedBy: uuid('finance_approved_by').references(() => users.id),
  financeApprovedAt: timestamp('finance_approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const budgetRequestItems = pgTable('budget_request_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  budgetRequestId: uuid('budget_request_id')
    .notNull()
    .references(() => budgetRequests.id, { onDelete: 'cascade' }),
  lineIndex: integer('line_index').default(1),
  description: varchar('description', { length: 255 }).notNull(),
  requestedAmount: numeric('requested_amount', {
    precision: 15,
    scale: 2,
  }).notNull(),
});

export const budgetInstallments = pgTable('budget_installments', {
  id: uuid('id').primaryKey().defaultRandom(),
  budgetRequestId: uuid('budget_request_id')
    .notNull()
    .references(() => budgetRequests.id, { onDelete: 'cascade' }),
  installmentNumber: integer('installment_number').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  percentage: numeric('percentage', { precision: 5, scale: 2 }),
  triggerType: installmentTriggerEnum('trigger_type').default('Auto'),
  releaseStatus: fundReleaseStatusEnum('release_status').default('Pending'),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  releasedBy: uuid('released_by').references(() => users.id),
  ledgerEntryId: uuid('ledger_entry_id'),
});

export const budgetLedger = pgTable('budget_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  budgetRequestId: uuid('budget_request_id')
    .notNull()
    .references(() => budgetRequests.id),
  installmentId: uuid('installment_id').references(() => budgetInstallments.id),
  amountReleased: numeric('amount_released', {
    precision: 15,
    scale: 2,
  }).notNull(),
  releaseDate: timestamp('release_date', { withTimezone: true }).defaultNow(),
  releasedBy: uuid('released_by').references(() => users.id),
  note: text('note'),
});
