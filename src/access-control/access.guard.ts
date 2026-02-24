import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessService } from './access.service';
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import { Permission } from './permission.enum';

/**
 * Guard that enforces permission checks on routes
 * Reads permission metadata from @RequirePermission decorator
 * Calls AccessService.can() to evaluate access
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private accessService: AccessService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permissions from decorator metadata
    const requiredPermissions = this.reflector.getAllAndOverride<
      Permission | Permission[]
    >(REQUIRE_PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    // If no permissions required, allow access
    if (!requiredPermissions) {
      return true;
    }

    // Extract user and context from request
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // User must be authenticated
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Extract context from request (if provided by previous middleware)
    const accessContext = request.accessContext || {};

    // Evaluate permission
    const hasAccess = await this.accessService.can(
      user,
      requiredPermissions,
      accessContext,
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        'Insufficient permissions to access this resource',
      );
    }

    return true;
  }
}
