import { PgDecisionActionType, PgDecisionOutcome } from '../types/pg';

export const buildDecisionOutcome = (
  action: PgDecisionActionType,
  hasNextRole: boolean,
): PgDecisionOutcome => {
  switch (action) {
    case 'APPROVE':
      return {
        newStatus: hasNextRole ? 'Under_Review' : 'Approved',
        unlockWorkspace: false,
        approvalDecision: 'Accepted',
        notificationType: 'Decision',
      };
    case 'REJECT':
      return {
        newStatus: 'Rejected',
        unlockWorkspace: false,
        approvalDecision: 'Rejected',
        notificationType: 'Decision',
      };
    case 'REVISION_REQUIRED':
      return {
        newStatus: 'Needs_Revision',
        unlockWorkspace: true,
        approvalDecision: 'Needs_Revision',
        notificationType: 'Revision_Required',
      };
    default:
      return {
        newStatus: 'Under_Review',
        unlockWorkspace: false,
        approvalDecision: 'Accepted',
        notificationType: 'Decision',
      };
  }
};
