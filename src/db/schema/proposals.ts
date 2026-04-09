import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  integer,
  bigint,
  timestamp,
  numeric,
  primaryKey,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './user';
import { projects } from './project';
import { departments } from './department';
import { ProjectProgramEnum, projectRoleEnum } from './project';
import {
  stepTypeEnum,
  degreeLevelEnum,
  proposalStatusEnum,
  approvalDecisionEnum,
} from './enums';

export const proposals = pgTable('proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  abstract: text('abstract'),
  proposalProgram: ProjectProgramEnum('proposal_program'),
  isFunded: boolean('is_funded').default(false),
  degreeLevel: degreeLevelEnum('degree_level').default('NA'),
  researchArea: varchar('research_area', { length: 255 }),
  durationMonths: integer('duration_months'),
  budgetAmount: numeric('budget_amount', { precision: 12, scale: 2 }).default(
    '0.00',
  ),
  currentStatus: proposalStatusEnum('current_status').default('Draft'),
  isEditable: boolean('is_editable').default(true),
  workspaceUnlocked: boolean('workspace_unlocked').default(false),
  workspaceUnlockedAt: timestamp('workspace_unlocked_at', {
    withTimezone: true,
  }),
  currentStepOrder: integer('current_step_order'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  currentVersionId: uuid('current_version_id'),
  projectId: uuid('project_id').references(() => projects.projectId),
  departmentId: uuid('department_id').references(() => departments.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const proposalMembers = pgTable('proposal_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: projectRoleEnum('role').notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow(),
});

export const proposalFiles = pgTable('proposal_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id, { onDelete: 'cascade' }),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  filePath: varchar('file_path', { length: 500 }).notNull(),
  fileType: varchar('file_type', { length: 50 }),
  checksum: varchar('checksum', { length: 64 }),
  fileSize: bigint('file_size', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const proposalVersions = pgTable('proposal_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => users.id),
  versionNumber: integer('version_number').default(1).notNull(),
  isCurrent: boolean('is_current').default(false),
  fileId: uuid('file_id').references(() => proposalFiles.id),
  contentJson: jsonb('content_json'),
  changeSummary: text('change_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const proposalApprovals = pgTable('proposal_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id, { onDelete: 'cascade' }),
  routingRuleId: uuid('routing_rule_id'),
  stepOrder: integer('step_order').notNull(),
  approverRole: varchar('approver_role', { length: 50 }).notNull(),
  approverUserId: uuid('approver_user_id').references(() => users.id),

  // Step metadata copies (audit trail - don't change during workflow)
  // Snapshot from routingRule at step creation time
  stepLabel: varchar('step_label', { length: 100 }),
  stepType: stepTypeEnum('step_type').notNull().default('APPROVAL'),

  // Form schema snapshot (for FORM steps)
  // Copied at step creation for audit trail
  dynamicFieldsJson: jsonb('dynamic_fields_json'),

  // Vote configuration snapshot (for VOTE steps)
  // Copied at step creation for audit trail and threshold checking
  voteThreshold: integer('vote_threshold'),
  voteThresholdStrategy: varchar('vote_threshold_strategy', { length: 50 }), // MAJORITY | ALL | NUMBER

  // Decision info
  decision: approvalDecisionEnum('decision').default('Pending'),
  isActive: boolean('is_active').default(false),
  comment: text('comment'),
  decisionAt: timestamp('decision_at', { withTimezone: true }),

  // VOTE steps: { userId: 'Accepted' | 'Rejected' | 'Needs_Revision' }
  // Tracks votes cast by eligible voters
  voteJson: jsonb('vote_json'),

  // FORM steps: form field values + fileIds
  // Example: { "field1": "value1", "file_field": "file-uuid-123" }
  submittedJson: jsonb('submitted_json'),

  // Parallel step grouping
  parallelGroupId: uuid('parallel_group_id'),

  // Branching: track which branch path this step came from
  branchKey: varchar('branch_key', { length: 50 }),
  conditionGroup: varchar('condition_group', { length: 50 }),

  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  versionId: uuid('version_id').references(() => proposalVersions.id),
  attachmentFileId: uuid('attachment_file_id').references(
    () => proposalFiles.id,
  ),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const proposalStatusHistory = pgTable('proposal_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id, { onDelete: 'cascade' }),
  oldStatus: proposalStatusEnum('old_status'),
  newStatus: proposalStatusEnum('new_status').notNull(),
  changedBy: uuid('changed_by').references(() => users.id),
  note: text('note'),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
});

export const proposalComments = pgTable('proposal_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id').references(() => proposalVersions.id),
  fileId: uuid('file_id').references(() => proposalFiles.id),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  parentCommentId: uuid('parent_comment_id'),
  commentText: text('comment_text').notNull(),
  anchorData: jsonb('anchor_data'),
  isResolved: boolean('is_resolved').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const proposalDefences = pgTable('proposal_defences', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id, { onDelete: 'cascade' }),
  scheduledBy: uuid('scheduled_by').references(() => users.id),
  defenceDate: timestamp('defence_date', { withTimezone: true }).notNull(),
  location: varchar('location', { length: 255 }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
