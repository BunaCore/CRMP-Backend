export enum Permission {
  // --- Proposal Core ---
  PROPOSAL_CREATE = 'proposal:create',
  PROPOSAL_READ = 'proposal:read',
  PROPOSAL_UPDATE = 'proposal:update',
  PROPOSAL_DELETE = 'proposal:delete',
  PROPOSAL_SUBMIT = 'proposal:submit',

  // --- Proposal Decisions (workflow actions) ---
  PROPOSAL_APPROVE = 'proposal:approve',
  PROPOSAL_REJECT = 'proposal:reject',
  PROPOSAL_REQUEST_REVISION = 'proposal:request_revision',

  // --- Evaluation ---
  EVALUATION_ASSIGN = 'evaluation:assign',
  EVALUATION_SUBMIT = 'evaluation:submit',
  EVALUATION_READ = 'evaluation:read',

  // --- Users (lifecycle + access) ---
  USER_READ = 'user:read', // View users (scoped)
  USER_PROVISION = 'user:provision', // Activate/deactivate, invite, lifecycle
  USER_ASSIGN_ROLE = 'user:assign_role', // Change roles/permissions

  // --- Authorization Management ---
  ROLE_CREATE = 'role:create',
  ROLE_READ = 'role:read',
  ROLE_UPDATE = 'role:update',
  ROLE_DELETE = 'role:delete',
  PERMISSION_ASSIGN = 'permission:assign', // Attach permissions to roles

  // --- Organization Structure ---
  DEPARTMENT_CREATE = 'department:create',
  DEPARTMENT_READ = 'department:read',
  DEPARTMENT_UPDATE = 'department:update',
  DEPARTMENT_DELETE = 'department:delete',

  SCHOOL_CREATE = 'school:create',
  SCHOOL_READ = 'school:read',
  SCHOOL_UPDATE = 'school:update',
  SCHOOL_DELETE = 'school:delete',

  // --- Domain-Specific Access ---
  ETHICS_READ = 'ethics:read',
  ETHICS_DECIDE = 'ethics:decide',

  BUDGET_VIEW = 'budget:view',
  BUDGET_MANAGE = 'budget:manage',

  // --- System & Platform ---
  SYSTEM_CONFIG = 'system:config', // Deadlines, workflow rules, global settings
  AUDIT_LOG_VIEW = 'audit_log:view',
  REPORT_EXPORT = 'report:export',
}
