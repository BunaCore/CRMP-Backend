import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilityFactory } from './ability.factory';
import {
  REQUIRE_CASL_RULES_KEY,
  REQUIRE_PERMISSION_KEY,
} from './require-permission.decorator';
import { Permission } from './permission.enum';
import { CaslRouteRule, PERMISSION_TO_CASL_RULES } from './casl-rule-map';

/**
 * Guard that builds CASL ability for authenticated users
 * Attaches ability to request for service-layer authorization
 *
 * Note: This guard does NOT enforce permissions.
 * Permission checks happen in services using CASL.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private abilityFactory: AbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Must be authenticated
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Build CASL ability from user's roles/permissions
    const ability = await this.abilityFactory.createAbility(user.id);

    // Attach ability to request for service-layer consumption
    request.ability = ability;

    // Prefer direct CASL route metadata when present
    const requiredCaslRules = this.reflector.getAllAndOverride<CaslRouteRule[]>(
      REQUIRE_CASL_RULES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredCaslRules && requiredCaslRules.length > 0) {
      const hasRequiredRule = requiredCaslRules.some((rule) =>
        ability.can(rule.action, rule.subject),
      );

      if (!hasRequiredRule) {
        throw new ForbiddenException('Insufficient permissions');
      }

      return true;
    }

    // Backward compatible permission metadata path
    const requiredPermissions = this.reflector.getAllAndOverride<
      Permission | Permission[]
    >(REQUIRE_PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions) {
      return true;
    }

    const permissions = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    const hasRequiredPermission = permissions.some((permission) =>
      this.abilityAllowsPermission(ability as any, permission),
    );

    if (!hasRequiredPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  private abilityAllowsPermission(
    ability: { can: (action: string, subject: string) => boolean },
    permission: Permission,
  ): boolean {
    const rules = this.permissionToRules(permission);
    return rules.some(({ action, subject }) => ability.can(action, subject));
  }

  private permissionToRules(
    permission: Permission,
  ): Array<{ action: string; subject: string }> {
    return PERMISSION_TO_CASL_RULES[permission] || [];
  }
}
