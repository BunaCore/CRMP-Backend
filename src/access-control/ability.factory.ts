import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  AbilityBuilder,
  MongoAbility,
  createMongoAbility,
} from '@casl/ability';
import { Permission } from './permission.enum';
import { UsersRepository } from 'src/users/users.repository';

/**
 * AbilityFactory builds CASL abilities from user roles and permissions
 * Fetches permissions directly from repository (infrastructure-level component)
 */
@Injectable()
export class AbilityFactory {
  constructor(private readonly usersRepository: UsersRepository) {}

  /**
   * Build ability for a user based on their roles and granted permissions
   */
  async createAbility(userId: string): Promise<MongoAbility> {
    try {
      // Fetch user permissions via repository
      const permissions = await this.usersRepository.getUserPermissions(userId);

      if (!permissions || permissions.length === 0) {
        // User has no permissions - return empty ability
        return createMongoAbility([]) as MongoAbility;
      }

      // Map permission keys to CASL rules
      const caslRules = this.mapPermissionsToCaslRules(permissions);

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
      console.error('Failed to create ability:', error);
      throw new InternalServerErrorException(
        'Failed to initialize permissions',
      );
    }
  }

  /**
   * Map Permission enum keys to CASL rules
   * Each permission translates to one or more action/subject combinations
   */
  private mapPermissionsToCaslRules(permissionKeys: string[]): Array<{
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
      [Permission.PROPOSAL_READ]: [{ action: 'read', subject: 'Proposal' }],
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
        console.warn(`Unknown permission: ${key}`);
      }
    });

    return rules;
  }
}
