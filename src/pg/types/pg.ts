export type PgDecisionActionType = 'APPROVE' | 'REJECT' | 'REVISION_REQUIRED';

export type PgDecisionOutcome = {
  newStatus: 'Under_Review' | 'Approved' | 'Rejected' | 'Needs_Revision';
  unlockWorkspace: boolean;
  approvalDecision: 'Accepted' | 'Rejected' | 'Needs_Revision';
  notificationType: 'Decision' | 'Revision_Required';
};
