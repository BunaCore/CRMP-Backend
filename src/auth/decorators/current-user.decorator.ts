import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Represents the authenticated user attached to the request
 * Contains full user data from database (not from JWT token)
 */
export interface AuthenticatedUser {
  id: string; // User ID (from JWT sub claim, but fetched fresh from DB)
  email: string; // From database
  roles: string[]; // Array of assigned roles (e.g., ['FACULTY', 'COORDINATOR'])
  role: string; // Primary role (from JWT and verified in database)
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
 *
 *   // Extract specific field
 *   @Get('/profile')
 *   getProfile(@CurrentUser('id') userId: string) {
 *     return userId;
 *   }
 */
export const CurrentUser = createParamDecorator(
  (
    data: string | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | string | string[] | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    // If a specific field is requested, extract it
    if (data && data in user) {
      const value = user[data as keyof AuthenticatedUser];
      // Return the value as-is (could be string, string[], or undefined)
      // Let callers and DTO validation handle missing fields
      return value;
    }

    // Return full user object
    return user;
  },
);
