import { pgEnum } from 'drizzle-orm/pg-core';

export const proposalStatusEnum = pgEnum('proposal_status', [
  'Draft',
  'Under_Review',
  'Needs_Revision',
  'Approved',
  'Rejected',
]);

export const stepTypeEnum = pgEnum('step_type', ['APPROVAL', 'VOTE', 'FORM']);

export const voteThresholdStrategyEnum = pgEnum('vote_threshold_strategy', [
  'MAJORITY',
  'ALL',
  'NUMBER',
]);

export const approvalDecisionEnum = pgEnum('approval_decision', [
  'Pending',
  'Accepted',
  'Rejected',
  'Needs_Revision',
]);

export const degreeLevelEnum = pgEnum('degree_level', ['Master', 'PhD', 'NA']);
