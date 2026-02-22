// Re-export all access-control module exports for convenience
export { AccessControlModule } from './access-control.module';
export {
  AccessService,
  type AuthUser,
  type AccessContext,
} from './access.service';
export { AccessGuard } from './access.guard';
export { RequirePermission } from './require-permission.decorator';
export { Permission } from './permission.enum';
export { Role } from './role.enum';
export { RolePermissions } from './role-permissions';
