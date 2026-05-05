import { Injectable } from '@nestjs/common';
import { asc, desc, eq, and, inArray, or, ilike, SQL, sql } from 'drizzle-orm';
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
import { invitations } from 'src/db/schema/invitations';
import { User, CreateUserInput, FindUserInput } from 'src/users/types/user';
import { UserSelectorDto } from 'src/types/selector';
import { DB } from 'src/db/db.type';
import { departments } from 'src/db/schema/department';
import { GetUsersQueryDto } from './dto/get-users-query.dto';

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

  async findUserDetailById(userId: string) {
    const [row] = await this.drizzle.db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        department: users.department,
        departmentId: users.departmentId,
        departmentName: departments.name,
        universityId: users.universityId,
        university: users.university,
        userProgram: users.userProgram,
        phoneNumber: users.phoneNumber,
        isExternal: users.isExternal,
        accountStatus: users.accountStatus,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(eq(users.id, userId));

    return row || null;
  }

  async departmentExists(departmentId: string): Promise<boolean> {
    const [department] = await this.drizzle.db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.id, departmentId));

    return !!department;
  }

  async getCoordinatorDepartments(userId: string) {
    return this.drizzle.db
      .select({
        id: departments.id,
        name: departments.name,
        code: departments.code,
        assignedAt: departmentCoordinators.assignedAt,
      })
      .from(departmentCoordinators)
      .innerJoin(
        departments,
        eq(departmentCoordinators.departmentId, departments.id),
      )
      .where(eq(departmentCoordinators.userId, userId));
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
        departmentId: input.departmentId,
        phoneNumber: input.phoneNumber,
        university: input.university,
        universityId: input.universityId,
        userProgram: input.userProgram || null,
        isExternal: input.isExternal,
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
        departmentId: input.departmentId,
        phoneNumber: input.phoneNumber,
        university: input.university,
        universityId: input.universityId,
        userProgram: input.userProgram || null,
        isExternal: input.isExternal,
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

  async replaceUserRoles(userId: string, roleIds: string[], tx?: DB) {
    const db = tx || this.drizzle.db;

    await db.delete(userRoles).where(eq(userRoles.userId, userId));

    if (roleIds.length === 0) {
      return;
    }

    await db.insert(userRoles).values(
      roleIds.map((roleId) => ({
        userId,
        roleId,
      })),
    );
  }

  async findRolesByIds(roleIds: string[], tx?: DB) {
    const db = tx || this.drizzle.db;
    if (roleIds.length === 0) {
      return [];
    }

    return db.select().from(roles).where(inArray(roles.id, roleIds));
  }

  async createInvitation(
    input: {
      email: string;
      tokenHash: string;
      invitedBy: string;
      roleId: string;
      expiresAt: Date;
    },
    tx?: DB,
  ) {
    const db = tx || this.drizzle.db;
    const [invitation] = await db.insert(invitations).values(input).returning();
    return invitation;
  }

  async findInvitationByTokenHash(tokenHash: string, tx?: DB) {
    const db = tx || this.drizzle.db;
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash));

    return invitation || null;
  }

  async markInvitationAccepted(invitationId: string, tx?: DB): Promise<void> {
    const db = tx || this.drizzle.db;
    await db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invitationId));
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

  /**
   * Get users for selector/dropdown (lightweight query)
   * Optional search by name/email and role filter
   * @param searchQuery - Optional search term for name or email
   * @param roleName - Optional role name to filter by
   * @param limit - Max results to return (default: 50)
   */
  async findForSelector(
    searchQuery?: string,
    roleName?: string,
    limit: number = 50,
  ): Promise<UserSelectorDto[]> {
    const conditions: any[] = [];

    if (searchQuery) {
      conditions.push(
        or(
          ilike(users.fullName as any, `%${searchQuery}%`),
          ilike(users.email, `%${searchQuery}%`),
        ),
      );
    }

    if (roleName) {
      conditions.push(eq(roles.name, roleName));
    }

    // Use selectDistinct on user fields to avoid duplicate rows when multiple roles exist
    let query: any = this.drizzle.db
      .selectDistinct({
        id: users.id,
        fullName: users.fullName,
        department: users.department,
        isExternal: users.isExternal,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id));

    for (const condition of conditions) {
      query = query.where(condition);
    }

    const results = await query.limit(limit);

    return results.map((row) => ({
      label: row.fullName || row.id,
      value: row.id,
      meta: {
        department: row.department || undefined,
        isExternal: row.isExternal || false,
      },
    }));
  }

  /**
   * Check if users exist by their IDs
   * @param userIds - Array of user IDs to validate
   * @returns boolean - true if all users exist
   */
  async usersExist(userIds: string[]): Promise<boolean> {
    const result = await this.drizzle.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, userIds));

    return result.length === userIds.length;
  }

  /**
   * Find multiple users by IDs (bulk query)
   * Avoids N+1 queries by fetching all users at once
   *
   * @param userIds Array of user IDs to fetch
   * @returns Array of users with their roles
   */
  async findByIds(userIds: string[]): Promise<User[]> {
    if (userIds.length === 0) {
      return [];
    }

    const rows = await this.drizzle.db
      .select({
        user: users,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(inArray(users.id, userIds));

    // Group by user ID and collect roles
    const userMap = new Map<string, User>();

    for (const row of rows) {
      const userId = row.user.id;

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          ...row.user,
          roles: [],
          role: '',
        } as any);
      }

      if (row.roleName) {
        const user = userMap.get(userId)!;
        (user.roles as string[]).push(row.roleName);
        if (!(user.role as string)) {
          user.role = row.roleName;
        }
      }
    }

    return Array.from(userMap.values());
  }

  private buildUserListWhere(
    query: GetUsersQueryDto,
  ): SQL<unknown> | undefined {
    const conditions: SQL<unknown>[] = [];

    if (query.search) {
      conditions.push(
        or(
          ilike(users.fullName as any, `%${query.search}%`),
          ilike(users.email, `%${query.search}%`),
          ilike(users.universityId as any, `%${query.search}%`),
        )!,
      );
    }

    if (query.roleId) {
      conditions.push(eq(userRoles.roleId, query.roleId));
    }

    if (query.roleName) {
      conditions.push(eq(roles.name, query.roleName));
    }

    if (query.departmentId) {
      conditions.push(eq(users.departmentId, query.departmentId));
    }

    if (query.accountStatus) {
      conditions.push(eq(users.accountStatus, query.accountStatus as any));
    }

    if (typeof query.isExternal === 'boolean') {
      conditions.push(eq(users.isExternal, query.isExternal));
    }

    if (conditions.length === 0) {
      return undefined;
    }

    return conditions.length === 1 ? conditions[0] : and(...conditions);
  }

  async countUsersForAdminList(query: GetUsersQueryDto): Promise<number> {
    const where = this.buildUserListWhere(query);

    const result = await this.drizzle.db
      .select({
        total: sql<number>`count(distinct ${users.id})`,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(where);

    return Number(result[0]?.total ?? 0);
  }

  async findUsersForAdminList(query: GetUsersQueryDto) {
    const where = this.buildUserListWhere(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';
    const limit = query.limit ?? 20;
    const offset = query.getOffset();

    const sortColumnMap = {
      fullName: users.fullName,
      email: users.email,
      createdAt: users.createdAt,
      accountStatus: users.accountStatus,
    } as const;

    const sortColumn = sortColumnMap[sortBy];
    const orderByExpr = sortDir === 'asc' ? asc(sortColumn) : desc(sortColumn);

    // Page by distinct user IDs to avoid role-join row duplication.
    const pagedUserIds = await this.drizzle.db
      .selectDistinct({
        id: users.id,
        sortValue: sortColumn,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(where)
      .orderBy(orderByExpr)
      .limit(limit)
      .offset(offset);

    if (pagedUserIds.length === 0) {
      return [];
    }

    const userIds = pagedUserIds.map((row) => row.id);

    return this.drizzle.db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        departmentId: users.departmentId,
        departmentName: departments.name,
        universityId: users.universityId,
        phoneNumber: users.phoneNumber,
        isExternal: users.isExternal,
        accountStatus: users.accountStatus,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(inArray(users.id, userIds))
      .orderBy(orderByExpr);
  }
}
