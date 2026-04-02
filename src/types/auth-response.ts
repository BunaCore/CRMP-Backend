import { UserWithPermissions } from './user-with-permissions';

/**
 * Standard auth response for /register, /login, /me endpoints
 * Includes tokens and sanitized user object with roles & permissions
 */
export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: UserWithPermissions;
}
