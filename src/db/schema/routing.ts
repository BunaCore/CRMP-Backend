import { pgTable, uuid, varchar, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { users } from './user';
import { proposalTypeEnum, proposalApprovals } from './proposals';

export const routingRules = pgTable('routing_rules', {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalType: proposalTypeEnum('proposal_type').notNull(),
    stepOrder: integer('step_order').notNull(),
    approverRole: varchar('approver_role', { length: 50 }).notNull(),
    stepLabel: varchar('step_label', { length: 100 }),
    isParallel: boolean('is_parallel').default(false),
    isFinal: boolean('is_final').default(false),
    required: boolean('required').default(true),
});

export const evaluatorAssignments = pgTable('evaluator_assignments', {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id').notNull(),
    evaluatorUserId: uuid('evaluator_user_id').notNull().references(() => users.id),
    assignedBy: uuid('assigned_by').notNull().references(() => users.id),
    proposalApprovalId: uuid('proposal_approval_id').references(() => proposalApprovals.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
    dueDate: timestamp('due_date', { withTimezone: true }),
});
