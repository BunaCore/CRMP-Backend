import { SetMetadata } from '@nestjs/common';
import { Permission } from './permission.enum';
import { CaslRouteRule } from './casl-rule-map';

export const REQUIRE_PERMISSION_KEY = 'require_permission';
export const REQUIRE_CASL_RULES_KEY = 'require_casl_rules';

/**
 * Decorator to specify required permission(s) for a route
 *
 * Usage:
 *   @RequirePermission('PROJECT_CREATE')  // Single permission
 *   @RequirePermission(['PROJECT_APPROVE', 'PROJECT_REJECT'])  // Multiple (OR logic)
 *
 * @param permissions - Single permission or array of permissions
 * @returns Decorator function
 */
export const RequirePermission = (permissions: Permission | Permission[]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permissions);

/**
 * Decorator to declare CASL action/subject checks directly at route level.
 * Supports OR semantics when multiple rules are provided.
 */
export const RequireCasl = (rule: CaslRouteRule | CaslRouteRule[]) =>
  SetMetadata(REQUIRE_CASL_RULES_KEY, Array.isArray(rule) ? rule : [rule]);
