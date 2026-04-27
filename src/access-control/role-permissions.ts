import { Role } from './role.enum';
import { Permission } from './permission.enum';

export const RolePermissions: Record<Role, Permission[]> = {
  // --- Academic / Research Identity ---

  [Role.STUDENT]: [
    Permission.PROPOSAL_CREATE,
    Permission.PROPOSAL_READ,
    Permission.PROPOSAL_UPDATE,
    Permission.PROPOSAL_SUBMIT,

    // ✅ PI capability
    Permission.PROPOSAL_ADD_MEMBER,
  ],

  [Role.FACULTY]: [
    Permission.PROPOSAL_CREATE,
    Permission.PROPOSAL_READ,
    Permission.PROPOSAL_UPDATE,
    Permission.PROPOSAL_SUBMIT,

    Permission.PROPOSAL_ADD_MEMBER,

    Permission.EVALUATION_READ,
  ],

  [Role.SUPERVISOR]: [
    Permission.PROPOSAL_READ,

    // ❗ No direct update (avoid silent mutation)
    Permission.PROPOSAL_REQUEST_REVISION,

    Permission.EVALUATION_READ,
  ],

  [Role.EVALUATOR]: [
    Permission.PROPOSAL_READ,

    Permission.EVALUATION_SUBMIT,
    Permission.EVALUATION_READ,
  ],

  // --- Departmental Authority ---

  [Role.COORDINATOR]: [
    Permission.PROPOSAL_READ,
    Permission.PROPOSAL_UPDATE,

    Permission.PROPOSAL_ASSIGN_EVALUATOR, // ✅ key addition

    Permission.PROPOSAL_APPROVE,
    Permission.PROPOSAL_REJECT,
    Permission.PROPOSAL_REQUEST_REVISION,

    Permission.EVALUATION_ASSIGN,
    Permission.EVALUATION_READ,
    Permission.EVALUATION_SUBMIT,

    Permission.DEFENCE_SCHEDULE, // ✅ Can schedule PI defences

    Permission.USER_READ,
  ],

  [Role.DGC_MEMBER]: [
    Permission.PROPOSAL_READ,

    Permission.PROPOSAL_APPROVE,
    Permission.PROPOSAL_REJECT,
    Permission.PROPOSAL_REQUEST_REVISION,

    Permission.EVALUATION_READ,

    Permission.DEFENCE_SCHEDULE, // ✅ Can schedule PI defences
  ],

  // --- College & Central Offices ---

  [Role.COLLEGE_OFFICE]: [
    Permission.PROPOSAL_READ,

    Permission.PROPOSAL_APPROVE,
    Permission.PROPOSAL_REJECT,

    Permission.REPORT_EXPORT,
  ],

  [Role.PG_OFFICE]: [
    Permission.PROPOSAL_READ,

    Permission.PROPOSAL_APPROVE,
    Permission.PROPOSAL_REJECT,

    Permission.REPORT_EXPORT,
  ],

  [Role.RAD]: [
    Permission.PROPOSAL_READ,

    // ✅ RAD handles research/grants evaluator assignment
    Permission.PROPOSAL_ASSIGN_EVALUATOR,

    Permission.PROPOSAL_APPROVE,
    Permission.PROPOSAL_REJECT,

    Permission.EVALUATION_ASSIGN,
    Permission.EVALUATION_READ,

    Permission.DEFENCE_SCHEDULE, // ✅ Can schedule PI defences

    Permission.BUDGET_VIEW,

    Permission.REPORT_EXPORT,
  ],

  [Role.FINANCE]: [
    Permission.PROPOSAL_READ, // ⚠️ you may later scope this

    Permission.BUDGET_VIEW,
    Permission.BUDGET_MANAGE,
  ],

  // --- Executive & System ---

  [Role.VPRTT]: [
    Permission.PROPOSAL_READ,

    Permission.PROPOSAL_APPROVE,
    Permission.PROPOSAL_REJECT,

    Permission.REPORT_EXPORT,
  ],

  [Role.AC_MEMBER]: [
    Permission.PROPOSAL_READ,

    Permission.PROPOSAL_APPROVE,
    Permission.PROPOSAL_REJECT,
  ],

  [Role.SYSTEM_ADMIN]: [
    Permission.PROPOSAL_READ,

    Permission.USER_READ,
    Permission.USER_PROVISION,
    Permission.USER_ASSIGN_ROLE,

    Permission.ROLE_CREATE,
    Permission.ROLE_READ,
    Permission.ROLE_UPDATE,
    Permission.ROLE_DELETE,

    Permission.PERMISSION_ASSIGN,

    Permission.DEPARTMENT_CREATE,
    Permission.DEPARTMENT_READ,
    Permission.DEPARTMENT_UPDATE,
    Permission.DEPARTMENT_DELETE,

    Permission.SCHOOL_CREATE,
    Permission.SCHOOL_READ,
    Permission.SCHOOL_UPDATE,
    Permission.SCHOOL_DELETE,

    Permission.SYSTEM_CONFIG,
    Permission.AUDIT_LOG_VIEW,
  ],

  // --- External ---

  [Role.EXTERNAL_EXPERT]: [
    Permission.PROPOSAL_READ,
    Permission.EVALUATION_SUBMIT,
    Permission.EVALUATION_READ,
  ],
};
