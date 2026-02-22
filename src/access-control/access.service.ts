import { Injectable } from '@nestjs/common';
import { Permission } from './permission.enum';
import { Role } from './role.enum';
import { RolePermissions } from './role-permissions';

/**
 * User interface for authorization context
 * Includes essential fields for access control
 */
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  department?: string;
  accountStatus?: string;
}

export interface AccessContext {
  project?: any; // Hydrated project entity
  projectMember?: any; // Hydrated projectMember entity
  targetUserId?: string; // For user-level permission checks
}

@Injectable()
export class AccessService {
  /**
   * Main authorization check
   * Evaluates: role permissions + attribute/scope checks
   * Does NOT evaluate workflow/state rules (business logic layer)
   *
   * @param user - The authenticated user
   * @param permissions - Single permission or array of permissions (OR logic)
   * @param context - Optional hydrated entities and resource references
   * @returns true if user has the permission, false otherwise
   */
  async can(
    user: AuthUser,
    permissions: Permission | Permission[],
    context?: AccessContext,
  ): Promise<boolean> {
    // Normalize permissions to array for easier processing
    const permissionList = Array.isArray(permissions)
      ? permissions
      : [permissions];

    // Step 1: Check role-based permissions (OR logic - any match grants access)
    const hasRolePermission = this.checkRolePermission(
      user.role,
      permissionList,
    );
    if (!hasRolePermission) {
      return false;
    }

    // Step 2: If context provided, check attribute/scope-level permissions
    if (context) {
      return this.checkAttributePermissions(user, context);
    }

    return true;
  }

  /**
   * Check if user's role has any of the required permissions
   * @param userRole - User's assigned role
   * @param permissions - Array of required permissions
   * @returns true if role has at least one permission (OR logic)
   */
  private checkRolePermission(
    userRole: string,
    permissions: Permission[],
  ): boolean {
    const rolePermissions = RolePermissions[userRole as Role] || [];
    return permissions.some((permission) =>
      rolePermissions.includes(permission),
    );
  }

  /**
   * Check attribute/scope-level permissions
   * Verifies department, program, and project membership constraints
   * @param user - Authenticated user
   * @param context - Hydrated entities
   * @returns true if all attribute checks pass
   */
  private checkAttributePermissions(
    user: AuthUser,
    context: AccessContext,
  ): boolean {
    // Check 1: Department matching (if project available)
    if (context.project) {
      const deptMatch = this.checkDepartmentMatch(user, context.project);
      if (!deptMatch) {
        return false;
      }
    }

    // Check 2: Project program eligibility (if project available)
    if (context.project) {
      const programMatch = this.checkProgramEligibility(user, context.project);
      if (!programMatch) {
        return false;
      }
    }

    // Check 3: Project membership and role (if projectMember available)
    if (context.projectMember) {
      const memberMatch = this.checkProjectMembership(
        user,
        context.projectMember,
      );
      if (!memberMatch) {
        return false;
      }
    }

    return true;
  }

  /**
   * Verify user's department matches project department
   * @param user - User entity
   * @param project - Project entity
   * @returns true if departments match
   */
  private checkDepartmentMatch(user: AuthUser, project: any): boolean {
    if (!user.department || !project.department) {
      return true; // Skip check if either is missing
    }
    return user.department === project.department;
  }

  /**
   * Verify user is eligible for the project's program (UG/PG/GENERAL)
   * Students/Supervisors pursuing that program level can access projects of same level
   * @param user - User entity
   * @param project - Project entity with projectProgram
   * @returns true if program is eligible
   */
  private checkProgramEligibility(user: AuthUser, project: any): boolean {
    // If no program specification, allow access
    if (!project.projectProgram) {
      return true;
    }

    // GENERAL projects are accessible to all
    if (project.projectProgram === 'GENERAL') {
      return true;
    }

    // For UG/PG programs, we'd typically check user.program (if stored)
    // For now, treat as open. Service layer can enforce stricter rules.
    return true;
  }

  /**
   * Verify user has the required role within the project
   * Checks if projectMember contains the user and has appropriate role
   * @param user - User entity
   * @param projectMember - Project member record
   * @returns true if user is valid project member
   */
  private checkProjectMembership(user: AuthUser, projectMember: any): boolean {
    // Verify the project member belongs to this user
    if (projectMember.userId !== user.id) {
      return false;
    }

    // If we need specific project member roles, check here
    // e.g., only PI, Evaluator, Supervisor can perform certain actions
    if (projectMember.role) {
      // This allows flexibility for future role-based checks
      return !!projectMember.role;
    }

    return true;
  }

  /**
   * Utility: Check if user is PI of a project
   * @param user - User entity
   * @param project - Project entity
   * @returns true if user is the PI
   */
  isProjectPI(user: AuthUser, project: any): boolean {
    return user.id === project.PI_ID;
  }

  /**
   * Utility: Check if user is assigned evaluator
   * @param user - User entity
   * @param project - Project entity
   * @returns true if user is assigned evaluator
   */
  isProjectEvaluator(user: AuthUser, project: any): boolean {
    return user.id === project.assignedEvaluator;
  }
}
