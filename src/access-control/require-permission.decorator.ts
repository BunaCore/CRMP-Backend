import { SetMetadata } from '@nestjs/common';
import { Permission } from './permission.enum';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

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
