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
  ],

  [Role.RAD]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_REVIEW,
    Permission.PROJECT_APPROVE,
    Permission.PROJECT_REJECT,
    Permission.ADMIN_VIEW,
  ],

  [Role.ADMIN]: [
    Permission.ADMIN_VIEW,
    Permission.ADMIN_EDIT,
    Permission.USER_VIEW,
    Permission.PROJECT_VIEW,
  ],
};
