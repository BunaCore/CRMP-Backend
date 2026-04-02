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

    permissionKeys.forEach((key) => {
      switch (key) {
        // Proposal permissions
        case Permission.PROJECT_CREATE:
          rules.push({ action: 'create', subject: 'Proposal' });
          break;
        case Permission.PROJECT_SUBMIT:
          rules.push({
            action: 'submit',
            subject: 'Proposal',
            conditions: { status: 'Draft' },
          });
          break;

        case Permission.PROJECT_VIEW:
          rules.push({ action: 'read', subject: 'Proposal' });
          break;

        case Permission.PROJECT_REVIEW:
          rules.push({ action: 'review', subject: 'Proposal' });
          break;

        case Permission.PROJECT_APPROVE:
          rules.push({ action: 'approve', subject: 'Proposal' });
          break;

        case Permission.PROJECT_REJECT:
          rules.push({ action: 'reject', subject: 'Proposal' });
          break;

        case Permission.PROJECT_RECOMMEND:
          rules.push({ action: 'recommend', subject: 'Proposal' });
          break;

        // Budget permissions
        case Permission.BUDGET_VIEW:
          rules.push({ action: 'read', subject: 'Budget' });
          break;

        case Permission.BUDGET_APPROVE:
          rules.push({ action: 'approve', subject: 'Budget' });
          break;

        case Permission.BUDGET_REJECT:
          rules.push({ action: 'reject', subject: 'Budget' });
          break;

        // Team management
        case Permission.TEAM_MANAGE:
          rules.push({ action: 'manage', subject: 'Team' });
          break;

        case Permission.TEAM_VIEW:
          rules.push({ action: 'read', subject: 'Team' });
          break;

        // Evaluator assignment
        case Permission.EVALUATOR_ASSIGN:
          rules.push({ action: 'assign', subject: 'Evaluator' });
          break;

        // Ethics
        case Permission.ETHICS_REVIEW:
          rules.push({ action: 'review', subject: 'Ethics' });
          break;

        case Permission.ETHICS_APPROVE:
          rules.push({ action: 'approve', subject: 'Ethics' });
          break;

        case Permission.ETHICS_REJECT:
          rules.push({ action: 'reject', subject: 'Ethics' });
          break;

        // Admin
        case Permission.ADMIN_VIEW:
          rules.push({ action: 'read', subject: 'Admin' });
          break;

        case Permission.ADMIN_EDIT:
          rules.push({ action: 'update', subject: 'Admin' });
          break;

        case Permission.CALENDAR_MANAGE:
          rules.push({ action: 'manage', subject: 'Calendar' });
          break;

        // User permissions
        case Permission.USER_VIEW:
          rules.push({ action: 'read', subject: 'User' });
          break;

        // Coordinator-exclusive
        case Permission.COORDINATOR_PROPOSALS_VIEW:
          rules.push({ action: 'read', subject: 'CoordinatorProposal' });
          break;

        case Permission.COORDINATOR_DECIDE:
          rules.push({ action: 'decide', subject: 'CoordinatorProposal' });
          break;

        case Permission.COORDINATOR_ASSIGN:
          rules.push({ action: 'assign', subject: 'Advisor' });
          break;

        // Funded permissions
        case Permission.FUNDED_SUBMIT:
          rules.push({
            action: 'submit',
            subject: 'FundedProposal',
          });
          break;

        case Permission.FUNDED_VIEW:
          rules.push({ action: 'read', subject: 'FundedProposal' });
          break;

        case Permission.FUNDED_RAD_ACCESS:
          rules.push({ action: 'triage', subject: 'FundedProposal' });
          break;

        case Permission.FUNDED_EVALUATOR_ACCESS:
          rules.push({ action: 'evaluate', subject: 'FundedProposal' });
          break;

        case Permission.FUNDED_APPROVER_ACCESS:
          rules.push({ action: 'approve', subject: 'FundedProposal' });
          break;

        case Permission.FUNDED_DECIDE:
          rules.push({ action: 'decide', subject: 'FundedProposal' });
          break;

        default:
          // Unknown permission - log but don't fail
          console.warn(`Unknown permission: ${key}`);
      }
    });

    return rules;
  }
}
