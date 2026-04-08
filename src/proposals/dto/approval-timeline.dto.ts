/**
 * Approval Timeline Response DTOs
 * Frontend-compatible structures for rendering approval step interactions
 */

export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export type VoteSummaryDto = {
  threshold: number | null;
  strategy: 'MAJORITY' | 'ALL' | 'NUMBER' | null;
  current: number; // Votes cast so far
  approved: number;
  rejected: number;
  abstained: number;
  votes: Record<string, 'Accepted' | 'Rejected' | 'Needs_Revision'>;
  eligibleVotersCount: number;
};

export type UserActionDto = {
  action: 'VOTE' | 'FORM_SUBMIT' | 'APPROVAL';
  decision?: 'Accepted' | 'Rejected' | 'Needs_Revision';
  data?: Record<string, any>;
  at?: Date;
  comment?: string;
};

export type SubmittedDto = {
  action: 'Accepted' | 'Rejected' | 'Needs_Revision';
  by: string; // userId of the approver
  at: Date;
  data?: Record<string, any> | null;
};

export type ApprovalTimelineStepDto = {
  id: string;
  stepOrder: number;
  stepLabel: string; // e.g., "Initial Screening", "Budget Review"
  stepType: 'APPROVAL' | 'VOTE' | 'FORM';
  approverRole: string;

  status: StepStatus;
  isActive: boolean;
  isFinal: boolean;

  canAct: boolean; // Can current user act on this step?
  userAction?: UserActionDto | null; // What user already did

  voteSummary?: VoteSummaryDto | null; // For VOTE steps only
  requiredFields?: Record<string, any> | null; // For FORM steps: form schema from routing rule

  submitted?: SubmittedDto | null; // Only if step is completed
};

export type ApprovalTimelineDto = {
  proposalId: string;
  currentStepOrder: number | null;
  steps: ApprovalTimelineStepDto[];
};
