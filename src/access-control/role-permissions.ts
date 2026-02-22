import { Role } from './role.enum';
import { Permission } from './permission.enum';

/**
 * Static role-to-permission mapping
 * Each role has a flat set of permissions (no inheritance)
 * Extensible: add new roles or permissions without changing core code
 */
export const RolePermissions: Record<Role, Permission[]> = {
  [Role.STUDENT]: [
    Permission.PROJECT_CREATE,
    Permission.PROJECT_SUBMIT,
    Permission.PROJECT_VIEW,
    Permission.TEAM_VIEW,
  ],

  [Role.SUPERVISOR]: [
    Permission.PROJECT_CREATE,
    Permission.PROJECT_SUBMIT,
    Permission.PROJECT_VIEW,
    Permission.TEAM_MANAGE,
    Permission.TEAM_VIEW,
    Permission.PROJECT_RECOMMEND,
  ],

  [Role.DEPARTMENT_HEAD]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_REVIEW,
    Permission.PROJECT_APPROVE,
    Permission.PROJECT_REJECT,
    Permission.TEAM_VIEW,
    Permission.BUDGET_VIEW,
    Permission.ADMIN_VIEW,
  ],

  [Role.PI]: [
    Permission.PROJECT_CREATE,
    Permission.PROJECT_SUBMIT,
    Permission.PROJECT_VIEW,
    Permission.TEAM_MANAGE,
    Permission.TEAM_VIEW,
    Permission.BUDGET_VIEW,
  ],

  [Role.RA]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_REVIEW,
    Permission.TEAM_VIEW,
    Permission.EVALUATOR_ASSIGN,
    Permission.BUDGET_VIEW,
    Permission.ADMIN_VIEW,
  ],

  [Role.ADRPM]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_REVIEW,
    Permission.PROJECT_APPROVE,
    Permission.PROJECT_REJECT,
    Permission.TEAM_VIEW,
    Permission.BUDGET_VIEW,
    Permission.BUDGET_APPROVE,
    Permission.BUDGET_REJECT,
    Permission.ETHICS_REVIEW,
    Permission.ETHICS_APPROVE,
    Permission.ETHICS_REJECT,
    Permission.EVALUATOR_ASSIGN,
    Permission.ADMIN_VIEW,
    Permission.ADMIN_EDIT,
    Permission.CALENDAR_MANAGE,
    Permission.USER_VIEW,
  ],

  [Role.VPRTT]: [
    Permission.PROJECT_VIEW,
    Permission.PROJECT_REVIEW,
    Permission.PROJECT_APPROVE,
    Permission.PROJECT_REJECT,
    Permission.TEAM_VIEW,
    Permission.BUDGET_VIEW,
    Permission.BUDGET_APPROVE,
    Permission.BUDGET_REJECT,
    Permission.ETHICS_REVIEW,
    Permission.ETHICS_APPROVE,
    Permission.ETHICS_REJECT,
    Permission.EVALUATOR_ASSIGN,
    Permission.ADMIN_VIEW,
    Permission.ADMIN_EDIT,
    Permission.CALENDAR_MANAGE,
    Permission.USER_VIEW,
  ],
};
