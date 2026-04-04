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
  accountStatus: string;
  createdAt?: Date | null;
}
