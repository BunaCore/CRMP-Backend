/**
 * Approval Timeline Response DTOs
 * Unified structure: all steps have canAct + userAction at top level
 * Type-specific data nested per stepType
 */

export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

/**
 * Unified user action across all step types
 * APPROVAL: APPROVED | REJECTED | NEEDS_REVISION
 * VOTE: APPROVED | REJECTED | NEEDS_REVISION
 * FORM: SUBMITTED
 */
export type UserAction =
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_REVISION'
  | 'SUBMITTED'
  | null;

// ============================================================================
// Type-Specific Data Structures
// ============================================================================

export type ApprovalDecision = {
  value: 'Accepted' | 'Rejected' | 'Needs_Revision' | null;
  by?: string; // userId
  at?: Date;
  comment?: string;
};

export type VoteData = {
  threshold: number | null;
  strategy: 'MAJORITY' | 'ALL' | 'NUMBER' | null;
  counts: {
    approved: number;
    rejected: number;
    abstained: number;
    total: number;
  };
  votes: Array<{
    userId: string;
    decision: 'Accepted' | 'Rejected' | 'Needs_Revision';
  }>;
};

export type FormData = {
  schema: Record<string, any> | null; // dynamicFieldsJson from routing rule
  submission?: {
    submittedBy: string; // userId
    submittedAt: Date;
    values: Record<string, any>; // submittedJson
  } | null;
};

// ============================================================================
// Unified Step Structure
// ============================================================================

export type ApprovalTimelineStepDto = {
  // Identity
  id: string;
  stepOrder: number;
  stepLabel: string;
  stepType: 'APPROVAL' | 'VOTE' | 'FORM';
  approverRole: string;

  // Global step state
  status: StepStatus;
  isActive: boolean;
  isFinal: boolean;

  // User-specific state (UNIFIED across all types)
  canAct: boolean; // Can current user act?
  userAction: UserAction; // What did user do? (null if nothing yet)

  // Type-specific data
  decision?: ApprovalDecision; // For APPROVAL
  vote?: VoteData; // For VOTE
  form?: FormData; // For FORM
};

export type ApprovalTimelineDto = {
  proposalId: string;
  currentStepOrder: number | null;
  steps: ApprovalTimelineStepDto[];
};
