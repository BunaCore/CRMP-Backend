import { Role } from './role.enum';
import { Permission } from './permission.enum';

/**
 * Static role-to-permission mapping
 * Each role has a flat set of permissions (no inheritance)
 */
export const RolePermissions: Record<Role, Permission[]> = {
  [Role.STUDENT]: [
    Permission.PROJECT_CREATE,
    Permission.PROJECT_SUBMIT,
    Permission.PROJECT_VIEW,
    Permission.TEAM_VIEW,
  ],

  [Role.PI]: [
    Permission.PROJECT_CREATE,
    Permission.PROJECT_SUBMIT,
    Permission.PROJECT_VIEW,
    Permission.TEAM_MANAGE,
    Permission.TEAM_VIEW,
    Permission.BUDGET_VIEW,
    // ── Funded Project (PI) ───────
    Permission.FUNDED_SUBMIT,
    Permission.FUNDED_VIEW,
  ],

  [Role.SUPERVISOR]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_REVIEW,
    Permission.TEAM_VIEW,
    Permission.PROJECT_RECOMMEND,
  ],

  [Role.COORDINATOR]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_REVIEW,
    Permission.PROJECT_APPROVE,
    Permission.PROJECT_REJECT,
    Permission.USER_VIEW,
    Permission.EVALUATOR_ASSIGN,
    // ── Coordinator-exclusive (UG track) ───────
    Permission.COORDINATOR_PROPOSALS_VIEW,
    Permission.COORDINATOR_DECIDE,
    Permission.COORDINATOR_ASSIGN,
  ],

  [Role.DGC_MEMBER]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_REVIEW,
    Permission.PROJECT_APPROVE,
    Permission.PROJECT_REJECT,
    Permission.EVALUATOR_ASSIGN,
    Permission.BUDGET_VIEW,
  ],

  [Role.EVALUATOR]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_REVIEW,
    // ── Funded Project (Evaluator) ───────
    Permission.FUNDED_EVALUATOR_ACCESS,
    Permission.FUNDED_VIEW,
    Permission.FUNDED_DECIDE,
  ],

  [Role.COLLEGE_OFFICE]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_APPROVE,
    Permission.PROJECT_REJECT,
    Permission.BUDGET_VIEW,
  ],

  [Role.PG_OFFICE]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_APPROVE,
    Permission.PROJECT_REJECT,
    Permission.BUDGET_VIEW,
    Permission.BUDGET_APPROVE,
    Permission.BUDGET_REJECT,
    Permission.ADMIN_VIEW,
  ],

  [Role.FINANCE]: [
    Permission.BUDGET_VIEW,
    Permission.BUDGET_APPROVE,
    Permission.BUDGET_REJECT,
    // ── Funded Project (Finance) ───────
    Permission.FUNDED_APPROVER_ACCESS,
    Permission.FUNDED_VIEW,
    Permission.FUNDED_DECIDE,
  ],

  [Role.RAD]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_REVIEW,
    Permission.PROJECT_APPROVE,
    Permission.PROJECT_REJECT,
    Permission.ADMIN_VIEW,
    // ── Funded Project (RAD) ───────
    Permission.FUNDED_RAD_ACCESS,
    Permission.FUNDED_VIEW,
    Permission.FUNDED_ASSIGN,
    Permission.FUNDED_DECIDE,
  ],

  [Role.ADMIN]: [
    Permission.ADMIN_VIEW,
    Permission.ADMIN_EDIT,
    Permission.USER_VIEW,
    Permission.PROJECT_VIEW,
  ],
  [Role.VPRTT]: [
    Permission.PROJECT_VIEW,
    Permission.BUDGET_VIEW,
    // ── Funded Project (VPRTT) ───────
    Permission.FUNDED_APPROVER_ACCESS,
    Permission.FUNDED_VIEW,
    Permission.FUNDED_DECIDE,
  ],
  [Role.AC]: [
    Permission.PROJECT_VIEW,
    Permission.BUDGET_VIEW,
    // ── Funded Project (AC) ───────
    Permission.FUNDED_APPROVER_ACCESS,
    Permission.FUNDED_VIEW,
    Permission.FUNDED_DECIDE,
  ],
  [Role.FACULTY]: [],
};
