/**
 * User object with permissions included (safe to return in API responses)
 * Used as return type for /register, /login, /me endpoints
 */
export interface UserWithPermissions {
  id: string;
  fullName?: string | null;
  email: string;
  department?: string | null;
  phoneNumber?: string | null;
  university?: string | null;
  universityId?: string | null;
  roles: string[];
  permissions: string[];
  /** Convenience flag: true when the user has the 'admin:view' permission.
   *  Use this on the frontend to guard the /admin route. */
  canAccessAdmin: boolean;
  accountStatus: string;
  createdAt?: Date | null;
}
