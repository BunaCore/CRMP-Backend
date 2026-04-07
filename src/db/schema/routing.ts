import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './user';
import { proposalApprovals } from './proposals';
import { ProjectProgramEnum } from './project';
import {
  proposalStatusEnum,
  stepTypeEnum,
  voteThresholdStrategyEnum,
} from './enums';

export const routingRules = pgTable('routing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalProgram: ProjectProgramEnum('proposal_program'),
  currentStatus: proposalStatusEnum('current_status'),
  stepOrder: integer('step_order').notNull(),
  approverRole: varchar('approver_role', { length: 50 }).notNull(),
  nextRole: varchar('next_role', { length: 50 }),
  stepLabel: varchar('step_label', { length: 100 }),
  isParallel: boolean('is_parallel').default(false),
  isFinal: boolean('is_final').default(false),
  required: boolean('required').default(true),

  // Step type and configuration
  stepType: stepTypeEnum('step_type').notNull().default('APPROVAL'),

  // VOTE step fields
  voteThreshold: integer('vote_threshold'),
  voteThresholdStrategy: voteThresholdStrategyEnum(
    'vote_threshold_strategy',
  ).default('MAJORITY'),

  // FORM step fields (dynamic form schema)
  dynamicFieldsJson: jsonb('dynamic_fields_json'),

  // Branching fields: conditional workflow steps
  // branchId groups alternative workflow paths (e.g., high-budget vs low-budget flow)
  // branchConditionJson defines when this step should be included
  // Example: { operator: 'gt', field: 'budgetAmount', value: 500000 }
  // During proposal creation, only steps where condition evaluates true are inserted
  branchId: uuid('branch_id'),
  branchConditionJson: jsonb('branch_condition_json'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const evaluatorAssignments = pgTable('evaluator_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id').notNull(),
  evaluatorUserId: uuid('evaluator_user_id')
    .notNull()
    .references(() => users.id),
  assignedBy: uuid('assigned_by')
    .notNull()
    .references(() => users.id),
  proposalApprovalId: uuid('proposal_approval_id').references(
    () => proposalApprovals.id,
  ),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
  dueDate: timestamp('due_date', { withTimezone: true }),
});
