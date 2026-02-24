import {
    pgTable, pgEnum, uuid, varchar, text,
    boolean, jsonb, integer, bigint, timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './user';
import { projects } from './project';

export const proposalTypeEnum = pgEnum('proposal_type', ['Undergraduate', 'Postgraduate', 'Funded_Project', 'Unfunded_Project']);
export const degreeLevelEnum = pgEnum('degree_level', ['Master', 'PhD', 'NA']);
export const proposalStatusEnum = pgEnum('proposal_status', ['Draft', 'Submitted', 'Under_Review', 'Partially_Approved', 'Approved', 'Rejected', 'Needs_Revision', 'Cancelled']);
export const approvalDecisionEnum = pgEnum('approval_decision', ['Pending', 'Accepted', 'Rejected', 'Needs_Revision']);

export const proposals = pgTable('proposals', {
    id: uuid('id').primaryKey().defaultRandom(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    title: varchar('title', { length: 255 }).notNull(),
    abstract: text('abstract'),
    proposalType: proposalTypeEnum('proposal_type').notNull(),
    degreeLevel: degreeLevelEnum('degree_level').default('NA'),
    researchArea: varchar('research_area', { length: 255 }),
    durationMonths: integer('duration_months'),
    advisorUserId: uuid('advisor_user_id').references(() => users.id),
    currentStatus: proposalStatusEnum('current_status').default('Draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    currentVersionId: uuid('current_version_id'),
    projectId: uuid('project_id').references(() => projects.projectId),
    workspaceUnlocked: boolean('workspace_unlocked').default(false),
    workspaceUnlockedAt: timestamp('workspace_unlocked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const proposalFiles = pgTable('proposal_files', {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
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
    proposalId: uuid('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
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
    proposalId: uuid('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
    routingRuleId: uuid('routing_rule_id'),
    stepOrder: integer('step_order').notNull(),
    approverRole: varchar('approver_role', { length: 50 }).notNull(),
    approverUserId: uuid('approver_user_id').references(() => users.id),
    decision: approvalDecisionEnum('decision').default('Pending'),
    comment: text('comment'),
    decisionAt: timestamp('decision_at', { withTimezone: true }),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    versionId: uuid('version_id').references(() => proposalVersions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const proposalStatusHistory = pgTable('proposal_status_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
    oldStatus: proposalStatusEnum('old_status'),
    newStatus: proposalStatusEnum('new_status').notNull(),
    changedBy: uuid('changed_by').references(() => users.id),
    note: text('note'),
    changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
});

export const proposalComments = pgTable('proposal_comments', {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id').references(() => proposalVersions.id),
    fileId: uuid('file_id').references(() => proposalFiles.id),
    authorId: uuid('author_id').notNull().references(() => users.id),
    parentCommentId: uuid('parent_comment_id'),
    commentText: text('comment_text').notNull(),
    anchorData: jsonb('anchor_data'),
    isResolved: boolean('is_resolved').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
