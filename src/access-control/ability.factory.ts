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
      [Permission.PROPOSAL_CREATE]: [{ action: 'create', subject: 'Proposal' }],
      [Permission.PROPOSAL_READ]: [{ action: 'read', subject: 'Proposal' }],
      [Permission.PROPOSAL_UPDATE]: [{ action: 'update', subject: 'Proposal' }],
      [Permission.PROPOSAL_DELETE]: [{ action: 'delete', subject: 'Proposal' }],
      [Permission.PROPOSAL_SUBMIT]: [{ action: 'submit', subject: 'Proposal' }],

      [Permission.PROPOSAL_APPROVE]: [
        { action: 'approve', subject: 'Proposal' },
      ],
      [Permission.PROPOSAL_REJECT]: [{ action: 'reject', subject: 'Proposal' }],
      [Permission.PROPOSAL_REQUEST_REVISION]: [
        { action: 'requestRevision', subject: 'Proposal' },
      ],

      [Permission.EVALUATION_ASSIGN]: [
        { action: 'assign', subject: 'Evaluation' },
      ],
      [Permission.EVALUATION_SUBMIT]: [
        { action: 'create', subject: 'Evaluation' },
        { action: 'update', subject: 'Evaluation' },
      ],
      [Permission.EVALUATION_READ]: [{ action: 'read', subject: 'Evaluation' }],

      [Permission.USER_READ]: [{ action: 'read', subject: 'User' }],
      [Permission.USER_PROVISION]: [{ action: 'provision', subject: 'User' }],
      [Permission.USER_ASSIGN_ROLE]: [
        { action: 'assignRole', subject: 'User' },
      ],

      [Permission.BUDGET_VIEW]: [{ action: 'read', subject: 'Budget' }],
      [Permission.BUDGET_MANAGE]: [{ action: 'manage', subject: 'Budget' }],

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
