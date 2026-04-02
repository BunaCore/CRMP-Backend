import { Injectable } from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { users } from 'src/db/schema/user';
import {
  userRoles,
  rolePermissions,
  permissions,
  roles,
} from 'src/db/schema/roles';
import { departmentCoordinators } from 'src/db/schema/department';
import { refreshTokens } from 'src/db/schema/refresh-tokens';
import { User, CreateUserInput, FindUserInput } from 'src/users/types/user';
import { DB } from 'src/db/db.type';

@Injectable()
export class UsersRepository {
  constructor(private drizzle: DrizzleService) {}

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.drizzle.db
      .select({
        user: users,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(users.email, email));

    if (!rows.length) return null;

    const user = rows[0].user;
    const rolesList = rows
      .filter((r) => r.roleName)
      .map((r) => r.roleName as string);

    return {
      ...user,
      roles: rolesList,
      role: rolesList[0] || '',
    } as any;
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.drizzle.db
      .select({
        user: users,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(users.id, id));

    if (!rows.length) return null;

    const user = rows[0].user;
    const rolesList = rows
      .filter((r) => r.roleName)
      .map((r) => r.roleName as string);

    return {
      ...user,
      roles: rolesList,
      role: rolesList[0] || '',
    } as any;
  }

  async findOne(input: FindUserInput): Promise<User | null> {
    if (input.email) {
      return this.findByEmail(input.email);
    }
    if (input.id) {
      return this.findById(input.id);
    }
    return null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const [user] = await this.drizzle.db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        department: input.department,
        phoneNumber: input.phoneNumber,
        university: input.university,
        universityId: input.universityId,
        accountStatus: input.accountStatus,
      })
      .returning();

    return user;
  }

  async findAll(): Promise<User[]> {
    return this.drizzle.db.select().from(users);
  }

  async update(
    id: string,
    input: Partial<CreateUserInput>,
  ): Promise<User | null> {
    const [user] = await this.drizzle.db
      .update(users)
      .set(input as any)
      .where(eq(users.id, id))
      .returning();

    return user || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.drizzle.db.delete(users).where(eq(users.id, id));

    return !!result.rowCount;
  }

  /**
   * Get all roles assigned to a user (non-null roles only)
   */
  async getUserRoles(userId: string) {
    const results = await this.drizzle.db
      .select({
        id: userRoles.id,
        roleId: userRoles.roleId,
        roleName: roles.name,
        grantedAt: userRoles.grantedAt,
      })
      .from(userRoles)
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    // Filter out null roleName values to ensure only valid roles are returned
    return results.filter((r) => r.roleName !== null);
  }

  /**
   * Check if user is a coordinator of a specific department
   */
  async isCoordinatorOfDepartment(
    userId: string,
    departmentId: string,
  ): Promise<boolean> {
    const [coordinator] = await this.drizzle.db
      .select()
      .from(departmentCoordinators)
      .where(
        and(
          eq(departmentCoordinators.userId, userId),
          eq(departmentCoordinators.departmentId, departmentId),
        ),
      );

    return !!coordinator;
  }

  /**
   * Get all permission keys a user has via role → permission mapping
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    // 1. Get user's roles and their role IDs
    const userRoleRecords = await this.drizzle.db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

    const roleIds = userRoleRecords.map((ur) => ur.roleId);

    if (roleIds.length === 0) {
      return [];
    }

    // 2. Get role → permission mappings for these roles
    const rolePerm = await this.drizzle.db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(inArray(rolePermissions.roleId, roleIds));

    const permissionIds = rolePerm.map((rp) => rp.permissionId);

    if (permissionIds.length === 0) {
      return [];
    }

    // 3. Get permission keys
    const perms = await this.drizzle.db
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.id, permissionIds));

    return perms.map((p) => p.key).filter(Boolean) as string[];
  }

  /**
   * Create a new user within an optional transaction
   * @param input - User data to create
   * @param tx - Optional transaction to use for the query
   */
  async createWithTx(input: CreateUserInput, tx?: DB): Promise<User> {
    const db = tx || this.drizzle.db;
    const [user] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        department: input.department,
        phoneNumber: input.phoneNumber,
        university: input.university,
        universityId: input.universityId,
        accountStatus: input.accountStatus,
      })
      .returning();

    return user;
  }

  /**
   * Assign a role to a user within an optional transaction
   * @param userId - User ID (UUID)
   * @param roleId - Role ID (UUID)
   * @param tx - Optional transaction to use for the query
   */
  async assignRole(userId: string, roleId: string, tx?: DB): Promise<void> {
    const db = tx || this.drizzle.db;
    await db.insert(userRoles).values({
      userId,
      roleId,
    });
  }

  /**
   * Find user by email with roles and permissions
   * @param email - User email
   * @param tx - Optional transaction to use for the query
   */
  async findByEmailWithTx(email: string, tx?: DB): Promise<User | null> {
    const db = tx || this.drizzle.db;
    const rows = await db
      .select({
        user: users,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(users.email, email));

    if (!rows.length) return null;

    const user = rows[0].user;
    const rolesList = rows
      .filter((r) => r.roleName)
      .map((r) => r.roleName as string);

    return {
      ...user,
      roles: rolesList,
      role: rolesList[0] || '',
    } as any;
  }

  /**
   * Save a refresh token
   * @param userId - User ID (UUID)
   * @param token - Refresh token string
   * @param expiresAt - Token expiration timestamp
   * @param tx - Optional transaction to use for the query
   */
  async saveRefreshToken(
    userId: string,
    token: string,
    expiresAt: Date,
    tx?: DB,
  ): Promise<void> {
    const db = tx || this.drizzle.db;
    await db.insert(refreshTokens).values({
      userId,
      token,
      expiresAt,
    });
  }

  /**
   * Revoke a refresh token
   * @param token - Refresh token string
   * @param tx - Optional transaction to use for the query
   */
  async revokeRefreshToken(token: string, tx?: DB): Promise<void> {
    const db = tx || this.drizzle.db;
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.token, token));
  }

  /**
   * Find valid (non-expired, non-revoked) refresh token
   * @param token - Refresh token string
   * @param tx - Optional transaction to use for the query
   */
  async findValidRefreshToken(token: string, tx?: DB) {
    const db = tx || this.drizzle.db;
    const now = new Date();
    const [refreshToken] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.token, token),
          eq(refreshTokens.revokedAt, null as any),
        ),
      );

    if (!refreshToken || refreshToken.expiresAt < now) {
      return null;
    }

    return refreshToken;
  }
}
