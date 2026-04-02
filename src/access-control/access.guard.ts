import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilityFactory } from './ability.factory';
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import { Permission } from './permission.enum';

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

    return true;
  }
}
