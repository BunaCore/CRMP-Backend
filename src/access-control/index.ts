// Re-export all access-control module exports for convenience
export { AccessControlModule } from './access-control.module';
export {
  AccessService,
  type AuthUser,
  type AccessContext,
} from './access.service';
export { AccessGuard } from './access.guard';
export { AbilityFactory } from './ability.factory';
export {
  RequirePermission,
  RequireCasl,
  REQUIRE_CASL_RULES_KEY,
  REQUIRE_PERMISSION_KEY,
} from './require-permission.decorator';
export { Permission } from './permission.enum';
export { Role } from './role.enum';
export { RolePermissions } from './role-permissions';
export { PERMISSION_TO_CASL_RULES, type CaslRouteRule } from './casl-rule-map';
