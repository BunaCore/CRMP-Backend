import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  AbilityBuilder,
  MongoAbility,
  createMongoAbility,
} from '@casl/ability';
import { Permission } from './permission.enum';
import { UsersRepository } from 'src/users/users.repository';
import { Role } from './role.enum';

/**
 * AbilityFactory builds CASL abilities from user roles and permissions
 * Fetches permissions directly from repository (infrastructure-level component)
 */
@Injectable()
export class AbilityFactory {
  private readonly logger = new Logger(AbilityFactory.name);

  constructor(private readonly usersRepository: UsersRepository) {}

  /**
   * Build ability for a user based on their roles and granted permissions
   */
  async createAbility(userId: string): Promise<MongoAbility> {
    try {
      const [permissions, userRoleRecords] = await Promise.all([
        this.usersRepository.getUserPermissions(userId),
        this.usersRepository.getUserRoles(userId),
      ]);

      const roleNames = userRoleRecords
        .map((r) => r.roleName)
        .filter((r): r is string => Boolean(r));

      if (!permissions || permissions.length === 0) {
        // User has no permissions - return empty ability
        return createMongoAbility([]) as MongoAbility;
      }

      // Map permission keys to CASL rules
      const caslRules = this.mapPermissionsToCaslRules(permissions, roleNames);

      // Build and return ability
      const { can, build } = new AbilityBuilder(createMongoAbility);

      caslRules.forEach((rule) => {
        if (rule.conditions) {
          can(rule.action as any, rule.subject as any, rule.conditions);
        } else {
          can(rule.action as any, rule.subject as any);
        }
      });

      return build();
    } catch (error) {
      this.logger.error({ err: error, userId }, 'Failed to create ability');
      throw new InternalServerErrorException(
        'Failed to initialize permissions',
      );
    }
  }

  /**
   * Map Permission enum keys to CASL rules
   * Each permission translates to one or more action/subject combinations
   */
  private mapPermissionsToCaslRules(
    permissionKeys: string[],
    roleNames: string[],
  ): Array<{
    action: string;
    subject: string;
    conditions?: Record<string, any>;
  }> {
    const rules: Array<{
      action: string;
      subject: string;
      conditions?: Record<string, any>;
    }> = [];

    // Permission-to-rules map to avoid repeated case statements
    const permissionRulesMap: Record<
      string,
      Array<{
        action: string;
        subject: string;
        conditions?: Record<string, any>;
      }>
    > = {
      // --- Proposal Core ---
      [Permission.PROPOSAL_CREATE]: [{ action: 'create', subject: 'Proposal' }],
      [Permission.PROPOSAL_READ]: this.buildProposalReadRules(roleNames),
      [Permission.PROPOSAL_UPDATE]: [{ action: 'update', subject: 'Proposal' }],
      [Permission.PROPOSAL_DELETE]: [{ action: 'delete', subject: 'Proposal' }],
      [Permission.PROPOSAL_SUBMIT]: [{ action: 'submit', subject: 'Proposal' }],

      // --- Proposal Member Management ---
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

      // --- Project Core ---
      [Permission.PROJECT_CREATE]: [{ action: 'create', subject: 'Project' }],
      [Permission.PROJECT_READ]: [{ action: 'read', subject: 'Project' }],
      [Permission.PROJECT_UPDATE]: [{ action: 'update', subject: 'Project' }],
      [Permission.PROJECT_DELETE]: [{ action: 'delete', subject: 'Project' }],

      // --- Proposal Decisions (workflow actions) ---
      [Permission.PROPOSAL_APPROVE]: [
        { action: 'approve', subject: 'Proposal' },
      ],
      [Permission.PROPOSAL_REJECT]: [{ action: 'reject', subject: 'Proposal' }],
      [Permission.PROPOSAL_REQUEST_REVISION]: [
        { action: 'requestRevision', subject: 'Proposal' },
      ],

      // --- Evaluation ---
      [Permission.EVALUATION_ASSIGN]: [
        { action: 'assign', subject: 'Evaluation' },
      ],
      [Permission.EVALUATION_SUBMIT]: [
        { action: 'create', subject: 'Evaluation' },
        { action: 'update', subject: 'Evaluation' },
      ],
      [Permission.EVALUATION_READ]: [{ action: 'read', subject: 'Evaluation' }],

      // --- Users (lifecycle + access) ---
      [Permission.USER_READ]: [{ action: 'read', subject: 'User' }],
      [Permission.USER_PROVISION]: [{ action: 'provision', subject: 'User' }],
      [Permission.USER_ASSIGN_ROLE]: [
        { action: 'assignRole', subject: 'User' },
      ],

      // --- Authorization Management ---
      [Permission.ROLE_CREATE]: [{ action: 'create', subject: 'Role' }],
      [Permission.ROLE_READ]: [{ action: 'read', subject: 'Role' }],
      [Permission.ROLE_UPDATE]: [{ action: 'update', subject: 'Role' }],
      [Permission.ROLE_DELETE]: [{ action: 'delete', subject: 'Role' }],
      [Permission.PERMISSION_ASSIGN]: [
        { action: 'assignPermission', subject: 'Role' },
      ],

      // --- Organization Structure ---
      [Permission.DEPARTMENT_CREATE]: [
        { action: 'create', subject: 'Department' },
      ],
      [Permission.DEPARTMENT_READ]: [{ action: 'read', subject: 'Department' }],
      [Permission.DEPARTMENT_UPDATE]: [
        { action: 'update', subject: 'Department' },
      ],
      [Permission.DEPARTMENT_DELETE]: [
        { action: 'delete', subject: 'Department' },
      ],

      [Permission.SCHOOL_CREATE]: [{ action: 'create', subject: 'School' }],
      [Permission.SCHOOL_READ]: [{ action: 'read', subject: 'School' }],
      [Permission.SCHOOL_UPDATE]: [{ action: 'update', subject: 'School' }],
      [Permission.SCHOOL_DELETE]: [{ action: 'delete', subject: 'School' }],

      // --- Domain-Specific Access ---
      [Permission.ETHICS_READ]: [{ action: 'read', subject: 'Ethics' }],
      [Permission.ETHICS_DECIDE]: [{ action: 'decide', subject: 'Ethics' }],

      // --- Budget ---
      [Permission.BUDGET_VIEW]: [{ action: 'read', subject: 'Budget' }],
      [Permission.BUDGET_MANAGE]: [{ action: 'manage', subject: 'Budget' }],

      // --- Defence ---
      [Permission.DEFENCE_SCHEDULE]: [
        { action: 'schedule', subject: 'Defence' },
      ],

      // --- System & Platform ---
      [Permission.SYSTEM_CONFIG]: [{ action: 'manage', subject: 'System' }],
      [Permission.AUDIT_LOG_VIEW]: [{ action: 'read', subject: 'AuditLog' }],
      [Permission.REPORT_EXPORT]: [{ action: 'export', subject: 'Report' }],
    };

    // Apply all rules for each permission
    permissionKeys.forEach((key) => {
      const rulesForPermission = permissionRulesMap[key];
      if (rulesForPermission) {
        rules.push(...rulesForPermission);
      } else {
        // Unknown permission - log but don't fail
        this.logger.warn(`Unknown permission: ${key}`);
      }
    });

    return rules;
  }

  private buildProposalReadRules(roleNames: string[]): Array<{
    action: string;
    subject: string;
    conditions?: Record<string, any>;
  }> {
    const roles = new Set(roleNames);

    if (roles.has(Role.SYSTEM_ADMIN)) {
      return [{ action: 'read', subject: 'Proposal' }];
    }

    const rules: Array<{
      action: string;
      subject: string;
      conditions?: Record<string, any>;
    }> = [];

    const memberOnlyRoles = [
      Role.STUDENT,
      Role.FACULTY,
      Role.SUPERVISOR,
      Role.EVALUATOR,
      Role.EXTERNAL_EXPERT,
    ];

    if (memberOnlyRoles.some((role) => roles.has(role))) {
      rules.push({
        action: 'read',
        subject: 'Proposal',
        conditions: { isMember: true },
      });
    }

    if (roles.has(Role.COORDINATOR)) {
      rules.push(
        {
          action: 'read',
          subject: 'Proposal',
          conditions: { program: 'UG' },
        },
        {
          action: 'read',
          subject: 'Proposal',
          conditions: { isMember: true },
        },
      );
    }

    if (roles.has(Role.DGC_MEMBER)) {
      rules.push(
        {
          action: 'read',
          subject: 'Proposal',
          conditions: { program: 'PG' },
        },
        {
          action: 'read',
          subject: 'Proposal',
          conditions: { isMember: true },
        },
      );
    }

    if (roles.has(Role.PG_OFFICE)) {
      rules.push(
        {
          action: 'read',
          subject: 'Proposal',
          conditions: { program: 'PG' },
        },
        {
          action: 'read',
          subject: 'Proposal',
          conditions: { isMember: true },
        },
      );
    }

    if (roles.has(Role.COLLEGE_OFFICE)) {
      rules.push(
        {
          action: 'read',
          subject: 'Proposal',
          conditions: { program: { $in: ['PG', 'GENERAL'] } },
        },
        {
          action: 'read',
          subject: 'Proposal',
          conditions: { isMember: true },
        },
      );
    }

    const generalOnlyRoles = [Role.RAD, Role.AC_MEMBER, Role.VPRTT];
    if (generalOnlyRoles.some((role) => roles.has(role))) {
      rules.push(
        {
          action: 'read',
          subject: 'Proposal',
          conditions: { program: 'GENERAL' },
        },
        {
          action: 'read',
          subject: 'Proposal',
          conditions: { isMember: true },
        },
      );
    }

    if (rules.length === 0) {
      // Unknown role fallback: own/member only
      rules.push({
        action: 'read',
        subject: 'Proposal',
        conditions: { isMember: true },
      });
    }

    return rules;
  }
}
