import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { proposals } from './proposals';
import { projects } from './project';
import { users } from './user';

export const evaluationPhaseEnum = pgEnum('evaluation_phase', [
  'PROPOSAL',
  'PROJECT',
]);
export const evaluationTypeEnum = pgEnum('evaluation_type', [
  'continuous',
  'final',
]);

export const evaluationRubrics = pgTable('evaluation_rubrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(), // e.g., 'Advisor', 'Proposal Defence'
  phase: evaluationPhaseEnum('phase').default('PROPOSAL'),
  type: evaluationTypeEnum('type').default('continuous'),
  maxPoints: numeric('max_points', { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const evaluationScores = pgTable(
  'evaluation_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rubricId: uuid('rubric_id')
      .notNull()
      .references(() => evaluationRubrics.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.projectId, {
      onDelete: 'cascade',
    }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    evaluatorId: uuid('evaluator_id')
      .notNull()
      .references(() => users.id),
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    feedback: varchar('feedback', { length: 1000 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => {
    return {
      // Prevents multiple scores for the same student on the same rubric in a single proposal.
      // Any evaluator can update this score.
      idx_unique_score: uniqueIndex('idx_eval_score_unique').on(
        table.rubricId,
        table.proposalId,
        table.studentId,
      ),
    };
  },
);



// Table 1: evaluation_rubrics (Your Rulebook) This table holds your static caps and limits. It separates criteria into PROPOSAL vs PROJECT phases.

// Advisor (Max 20 pts) -> Phase: PROPOSAL/PROJECT
// Proposal Defence (Max 15) -> Phase: PROPOSAL
// Documentation (Max 20) -> Phase: PROJECT
// Defence Individual (Max 15) -> Phase: PROJECT
// Defence Group (Max 30) -> Phase: PROJECT
// Table 2: evaluation_scores (The Results) This table stores the actual points pushed by an evaluator. It connects everything:

// rubric_id: which row in the rubric they are scoring.
// proposal_id: The proposal being evaluated (Always filled).
// project_id: Null during the proposal phase. Once a proposal is approved by the master, the remaining evaluations will populate this field allowing you to track exactly how their performance carried over from the initial proposal through to the project's final defence!
// student_id: The exact person receiving these points.
// evaluator_id: The instructor/advisor giving the points.
// score: The raw points out of the cap (e.g. 13.32).