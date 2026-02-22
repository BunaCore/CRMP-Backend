import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Represents the authenticated user attached to the request
 * Contains full user data from database (not from JWT token)
 */
export interface AuthenticatedUser {
  id: string; // User ID (from JWT sub claim, but fetched fresh from DB)
  email: string; // From database
  role: string; // From JWT and verified in database
  department?: string; // From database
  accountStatus?: string; // From database
  fullName?: string; // From database
  phone?: string; // From database
  universityId?: string; // From database
}

/**
 * Decorator to inject the authenticated user into route handlers
 *
 * Usage:
 *   @Get('/profile')
 *   @UseGuards(JwtAuthGuard)
 *   getProfile(@CurrentUser() user: AuthenticatedUser) {
 *     return user;
 *   }
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
