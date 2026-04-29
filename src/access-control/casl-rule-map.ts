import { Permission } from './permission.enum';

export type CaslRouteRule = {
  action: string;
  subject: string;
};

export const PERMISSION_TO_CASL_RULES: Record<
  Permission,
  Array<CaslRouteRule>
> = {
  [Permission.PROPOSAL_CREATE]: [{ action: 'create', subject: 'Proposal' }],
  [Permission.PROPOSAL_READ]: [{ action: 'read', subject: 'Proposal' }],
  [Permission.PROPOSAL_UPDATE]: [{ action: 'update', subject: 'Proposal' }],
  [Permission.PROPOSAL_DELETE]: [{ action: 'delete', subject: 'Proposal' }],
  [Permission.PROPOSAL_SUBMIT]: [{ action: 'submit', subject: 'Proposal' }],
  [Permission.PROPOSAL_ASSIGN_ADVISOR]: [
    { action: 'assignAdvisor', subject: 'Proposal' },
  ],
  [Permission.PROPOSAL_ASSIGN_SUPERVISOR]: [
    { action: 'assignSupervisor', subject: 'Proposal' },
  ],
  [Permission.PROPOSAL_ASSIGN_EVALUATOR]: [
    { action: 'assignEvaluator', subject: 'Proposal' },
  ],
  [Permission.PROPOSAL_ADD_MEMBER]: [
    { action: 'addMember', subject: 'Proposal' },
  ],
  [Permission.PROPOSAL_MANAGE_MEMBERS]: [
    { action: 'addMember', subject: 'Proposal' },
    { action: 'removeMember', subject: 'Proposal' },
    { action: 'updateMemberRole', subject: 'Proposal' },
  ],
  [Permission.PROJECT_CREATE]: [{ action: 'create', subject: 'Project' }],
  [Permission.PROJECT_READ]: [{ action: 'read', subject: 'Project' }],
  [Permission.PROJECT_UPDATE]: [{ action: 'update', subject: 'Project' }],
  [Permission.PROJECT_DELETE]: [{ action: 'delete', subject: 'Project' }],
  [Permission.PROPOSAL_APPROVE]: [{ action: 'approve', subject: 'Proposal' }],
  [Permission.PROPOSAL_REJECT]: [{ action: 'reject', subject: 'Proposal' }],
  [Permission.PROPOSAL_REQUEST_REVISION]: [
    { action: 'requestRevision', subject: 'Proposal' },
  ],
  [Permission.EVALUATION_ASSIGN]: [{ action: 'assign', subject: 'Evaluation' }],
  [Permission.EVALUATION_SUBMIT]: [
    { action: 'create', subject: 'Evaluation' },
    { action: 'update', subject: 'Evaluation' },
  ],
  [Permission.EVALUATION_READ]: [{ action: 'read', subject: 'Evaluation' }],
  [Permission.USER_READ]: [{ action: 'read', subject: 'User' }],
  [Permission.USER_PROVISION]: [{ action: 'provision', subject: 'User' }],
  [Permission.USER_ASSIGN_ROLE]: [{ action: 'assignRole', subject: 'User' }],
  [Permission.ROLE_CREATE]: [{ action: 'create', subject: 'Role' }],
  [Permission.ROLE_READ]: [{ action: 'read', subject: 'Role' }],
  [Permission.ROLE_UPDATE]: [{ action: 'update', subject: 'Role' }],
  [Permission.ROLE_DELETE]: [{ action: 'delete', subject: 'Role' }],
  [Permission.PERMISSION_ASSIGN]: [
    { action: 'assignPermission', subject: 'Role' },
  ],
  [Permission.DEPARTMENT_CREATE]: [{ action: 'create', subject: 'Department' }],
  [Permission.DEPARTMENT_READ]: [{ action: 'read', subject: 'Department' }],
  [Permission.DEPARTMENT_UPDATE]: [{ action: 'update', subject: 'Department' }],
  [Permission.DEPARTMENT_DELETE]: [{ action: 'delete', subject: 'Department' }],
  [Permission.SCHOOL_CREATE]: [{ action: 'create', subject: 'School' }],
  [Permission.SCHOOL_READ]: [{ action: 'read', subject: 'School' }],
  [Permission.SCHOOL_UPDATE]: [{ action: 'update', subject: 'School' }],
  [Permission.SCHOOL_DELETE]: [{ action: 'delete', subject: 'School' }],
  [Permission.ETHICS_READ]: [{ action: 'read', subject: 'Ethics' }],
  [Permission.ETHICS_DECIDE]: [{ action: 'decide', subject: 'Ethics' }],
  [Permission.BUDGET_VIEW]: [{ action: 'read', subject: 'Budget' }],
  [Permission.BUDGET_MANAGE]: [{ action: 'manage', subject: 'Budget' }],
  [Permission.DEFENCE_SCHEDULE]: [{ action: 'schedule', subject: 'Defence' }],
  [Permission.SYSTEM_CONFIG]: [{ action: 'manage', subject: 'System' }],
  [Permission.AUDIT_LOG_VIEW]: [{ action: 'read', subject: 'AuditLog' }],
  [Permission.REPORT_EXPORT]: [{ action: 'export', subject: 'Report' }],
};
