import {
  pgTable,
  uuid,
  text,
  integer,
  date,
  pgEnum,
  primaryKey,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
import { departments } from './department';
import { users } from './user';

export const ProjectStageEnum = pgEnum('project_stage', [
  'Submitted',
  'Under Review',
  'Approved',
  'Rejected',
  'Completed',
]);

export const EthicalClearanceStatusEnum = pgEnum('ethical_clearance_status', [
  'Pending',
  'Approved',
  'Rejected',
]);

export const projectRoleEnum = pgEnum('project_role', [
  'MEMBER',
  'PI',
  'SUPERVISOR',
  'EVALUATOR',
  'ADVISOR',
]);

export const ProjectProgramEnum = pgEnum('project_program', [
  'UG',
  'PG',
  'GENERAL',
]);

export const projects = pgTable('projects', {
  projectId: uuid('project_id').primaryKey().defaultRandom(),
  projectTitle: text('project_title').notNull(),
  isFunded: boolean('is_funded').default(false),
  projectStage: ProjectStageEnum('project_stage').notNull(),
  projectDescription: text('project_description'),
  submissionDate: date('submission_date').notNull(),
  proposalFile: text('proposal_file'), // store file path or URL
  researchArea: text('research_area'),
  projectProgram: ProjectProgramEnum('project_program'),
  department: text('department'), // TODO: left for backward compatablity @depricated
  departmentId: uuid('department_id').references(() => departments.id),
  durationMonths: integer('duration_months').notNull(),
  // PI is now derived from project_members where role = 'PI'
  ethicalClearanceStatus: EthicalClearanceStatusEnum(
    'ethical_clearance_status',
  ).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Project members should be in a separate table for proper many-to-many relationship
export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: projectRoleEnum('role').notNull(),
    addedAt: timestamp('added_at').defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.userId] }),
  }),
);
