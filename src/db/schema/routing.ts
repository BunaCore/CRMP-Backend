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
  stepOrder: integer('step_order').notNull(),
  approverRole: varchar('approver_role', { length: 50 }).notNull(),
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
  // branchKey identifies which branch this step belongs to (e.g., "LOW_BUDGET", "HIGH_BUDGET")
  // conditionGroup groups alternative branches together (e.g., "budget_threshold")
  // Only ONE branch per conditionGroup should evaluate true at step generation time
  // branchConditionJson defines when this step should be included
  branchKey: varchar('branch_key', { length: 50 }),
  conditionGroup: varchar('condition_group', { length: 50 }),
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
