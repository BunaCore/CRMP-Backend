import {
  pgTable,
  uuid,
  text,
  integer,
  date,
  pgEnum,
  primaryKey,
  timestamp,
} from 'drizzle-orm/pg-core';

export const ProjectTypeEnum = pgEnum('project_type', [
  'Funded',
  'Non-Funded',
  'Undergraduate',
]);

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
]);

export const ProjectProgramEnum = pgEnum('project_program', [
  'UG',
  'PG',
  'GENERAL',
]);

export const projects = pgTable('projects', {
  projectId: uuid('project_id').primaryKey().defaultRandom(),
  projectTitle: text('project_title').notNull(),
  projectType: ProjectTypeEnum('project_type').notNull(),
  projectStage: ProjectStageEnum('project_stage').notNull(),
  projectDescription: text('project_description'),
  submissionDate: date('submission_date').notNull(),
  proposalFile: text('proposal_file'), // store file path or URL
  researchArea: text('research_area'),
  projectProgram: ProjectProgramEnum('project_program'),
  department: text('department'), // Department for scope checking
  durationMonths: integer('duration_months').notNull(),
  PI_ID: uuid('pi_id').notNull(), // Principal Investigator (userId)
  assignedEvaluator: uuid('assigned_evaluator'), // userId of examiner
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
      .references(() => projects.projectId),
    role: projectRoleEnum('role'),
    userId: uuid('user_id').notNull(), // references userId
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.userId] }),
  }),
);
