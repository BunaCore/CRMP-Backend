import {
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Permission } from './permission.enum';
import { Role } from './role.enum';
import { RolePermissions } from './role-permissions';
import { DrizzleService } from 'src/db/db.service';
import { AccessRepository } from './access.repository';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import {
  AuditAction,
  AuditActionValue,
} from 'src/audit-logs/types/audit-action.enum';

/**
 * User interface for authorization context
 * Represents the authenticated user with system-level attributes
 * Role is the SYSTEM role (global scope: ADRPM, STUDENT, SUPERVISOR, etc.)
 * NOT project-specific roles (those use projectMember in AccessContext)
 */
export interface AuthUser {
  id: string;
  email: string;
  role: string; // System role (ADRPM, VPRTT, RA, STUDENT, SUPERVISOR, DEPARTMENT_HEAD, PI)
  department?: string;
  accountStatus?: string;
}

/**
 * Access control context for resource-level authorization checks
 * All fields are optional - pass only what's needed for evaluation
 * Must use HYDRATED entities (not just IDs) for proper authorization
 */
export interface AccessContext {
  project?: any; // Hydrated project entity (must be full object with department, projectProgram, PI_ID, etc.)
  projectMember?: any; // User's resource-specific role in the project (PI, EVALUATOR, SUPERVISOR)
  targetUserId?: string; // For user-level operations
}

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly accessRepository: AccessRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async listRoles() {
    return this.accessRepository.findRoles();
  }

  async createRole(dto: CreateRoleDto, actorUserId?: string) {
    const existing = await this.accessRepository.findRoleByName(dto.name);
    if (existing) {
      throw new ConflictException(`Role name "${dto.name}" already exists`);
    }

    const created = await this.accessRepository.createRole({
      name: dto.name,
      description: dto.description,
    });

    void this.logAudit({
      actorUserId,
      action: AuditAction.CREATED,
      entityType: 'roles',
      entityId: created.id,
      metadata: {
        operation: 'CREATE_ROLE',
        name: created.name,
        description: created.description,
      },
    });

    return created;
  }

  async updateRole(roleId: string, dto: UpdateRoleDto, actorUserId?: string) {
    const current = await this.accessRepository.findRoleById(roleId);
    if (!current) {
      throw new NotFoundException(`Role "${roleId}" not found`);
    }

    if (dto.name && dto.name !== current.name) {
      const duplicate = await this.accessRepository.findRoleByName(dto.name);
      if (duplicate && duplicate.id !== roleId) {
        throw new ConflictException(`Role name "${dto.name}" already exists`);
      }
    }

    const updated = await this.accessRepository.updateRole(roleId, dto);
    if (!updated) {
      throw new NotFoundException(`Role "${roleId}" not found`);
    }

    void this.logAudit({
      actorUserId,
      action: AuditAction.UPDATED,
      entityType: 'roles',
      entityId: roleId,
      metadata: {
        operation: 'UPDATE_ROLE',
        name: dto.name ?? null,
        description: dto.description ?? null,
      },
    });

    return updated;
  }

  async deleteRole(roleId: string, actorUserId?: string) {
    const exists = await this.accessRepository.findRoleById(roleId);
    if (!exists) {
      throw new NotFoundException(`Role "${roleId}" not found`);
    }

    const deleted = await this.accessRepository.deleteRole(roleId);
    void this.logAudit({
      actorUserId,
      action: AuditAction.DELETED,
      entityType: 'roles',
      entityId: roleId,
      metadata: {
        operation: 'DELETE_ROLE',
      },
    });

    return { success: deleted };
  }

  async listPermissions() {
    return this.accessRepository.findPermissions();
  }

  async getRolePermissions(roleId: string) {
    const role = await this.accessRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundException(`Role "${roleId}" not found`);
    }

    const permissions = await this.accessRepository.findRolePermissions(roleId);
    return {
      role,
      permissions,
    };
  }

  async replaceRolePermissions(
    roleId: string,
    permissionIds: string[],
    actorUserId?: string,
  ) {
    const role = await this.accessRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundException(`Role "${roleId}" not found`);
    }

    const uniquePermissionIds = Array.from(new Set(permissionIds));
    const existingPermissions =
      await this.accessRepository.findPermissionsByIds(uniquePermissionIds);

    const foundIds = new Set(existingPermissions.map((p) => p.id));
    const invalidPermissionIds = uniquePermissionIds.filter(
      (id) => !foundIds.has(id),
    );

    await this.drizzle.transaction(async (tx) => {
      await this.accessRepository.deleteRolePermissions(roleId, tx);
      await this.accessRepository.insertRolePermissions(
        roleId,
        existingPermissions.map((p) => p.id),
        tx,
      );
    });

    const updated = await this.accessRepository.findRolePermissions(roleId);

    void this.logAudit({
      actorUserId,
      action: AuditAction.PERMISSION_CHANGED,
      entityType: 'role_permissions',
      entityId: roleId,
      metadata: {
        operation: 'REPLACE_ROLE_PERMISSIONS',
        permissionIds,
        ignoredPermissionIds: invalidPermissionIds,
      },
    });

    return {
      role,
      permissions: updated,
      ignoredPermissionIds: invalidPermissionIds,
      warning:
        invalidPermissionIds.length > 0
          ? 'Some permissionIds were ignored because they do not exist'
          : undefined,
    };
  }

  private async logAudit(input: {
    actorUserId?: string | null;
    action: AuditActionValue;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, any> | null;
  }) {
    try {
      await this.auditLogsService.record(input);
    } catch (error) {
      this.logger.warn(
        `Failed to record audit log for ${input.entityType}/${input.entityId ?? 'n/a'}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Main authorization check - AUTHORIZATION ONLY
   *
   * Evaluates:
   * - Role-based permissions (system role → available actions)
   * - Attribute checks (department match, program eligibility, project membership)
   *
   * Does NOT evaluate (belongs in service layer):
   * - Workflow/state transitions
   * - Business rules and constraints
   * - Calendar/enrollment windows
   * - Complex multi-step approval chains
   *
   * @param user - The authenticated user (system role)
   * @param permissions - Single permission or array of permissions (OR logic)
   * @param context - Optional hydrated entities for attribute-based checks
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
   *
   * Does NOT enforce (business logic - belongs in service layer):
   * - Workflow state validation
   * - Business rule constraints
   * - Calendar validation
   * - Cascading or multi-level approvals
   *
   * @param user - Authenticated user with system role
   * @param context - Hydrated entities (project, projectMember)
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
   *
   * IMPORTANT: Department matching is CONDITIONAL
   * - Enforced for scoped roles (SUPERVISOR, DEPARTMENT_HEAD, PI)
   * - Skipped for cross-department roles (ADRPM, VPRTT, RA)
   * - Currently implemented as permissive check; role-based filtering
   *   happens in domain services (e.g., projects controller filters results)
   *
   * @param user - User entity with department
   * @param project - Project entity with department
   * @returns true if departments match or either is missing
   */
  private checkDepartmentMatch(user: AuthUser, project: any): boolean {
    if (!user.department || !project.department) {
      return true; // Skip check if either is missing
    }
    return user.department === project.department;
  }

  /**
   * Verify user is eligible for the project's program (UG/PG/GENERAL)
   *
   * Program is a PROJECT attribute, not a user attribute.
   * This method performs ROLE-BASED initial checks only.
   *
   * Does NOT check (belongs in domain services):
   * - "UG projects only open during Aug-Dec" (calendar rule)
   * - Enrollment window validation
   * - Program-specific workflow constraints
   *
   * @param user - User entity with system role
   * @param project - Project entity with projectProgram field
   * @returns true if program is eligible for this user's role
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

    // UG/PG programs: basic role check
    // Service layer should enforce: "UG projects only open during Aug-Dec"
    return true;
  }

  /**
   * Verify user has the required role within the project
   *
   * Project roles (PI, EVALUATOR, SUPERVISOR) are RESOURCE-SPECIFIC.
   * These are distinct from and independent of system roles (ADRPM, STUDENT, etc.)
   *
   * A user might be:
   * - System role: STUDENT, but Project role: PI (of a specific project)
   * - System role: SUPERVISOR, but Project role: EVALUATOR (of a different project)
   *
   * @param user - User entity with system role
   * @param projectMember - ProjectMember record with resource-specific role and userId
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
