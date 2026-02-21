import { User } from 'src/users/types/user';

/**
 * Removes sensitive information from user object
 * Safe to return in API responses
 */
export function sanitizeUser(user: User) {
  const { passwordHash, ...sanitized } = user;
  return sanitized;
}

/**
 * Removes sensitive fields from multiple users
 */
export function sanitizeUsers(users: User[]) {
  return users.map(sanitizeUser);
}
