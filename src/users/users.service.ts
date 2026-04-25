import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { User, CreateUserInput } from 'src/users/types/user';
import { UserSelectorDto } from 'src/types/selector';
import { NotFoundException } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { buildPaginationMeta } from 'src/common/pagination/utils/build-pagination-meta';
import { UsersListResponse } from './types/user-admin-list.type';
import { UserDetailResponse } from './types/user-detail.type';

@Injectable()
export class UsersService {
  constructor(
    private usersRepository: UsersRepository,
    private readonly drizzle: DrizzleService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async findOne(input: any): Promise<User | null> {
    return this.usersRepository.findOne(input);
  }

  async create(input: CreateUserInput): Promise<User> {
    return this.usersRepository.create(input);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.findAll();
  }

  async update(
    id: string,
    input: Partial<CreateUserInput>,
  ): Promise<User | null> {
    return this.usersRepository.update(id, input);
  }

  async delete(id: string): Promise<boolean> {
    return this.usersRepository.delete(id);
  }

  /**
   * Get all roles assigned to a user
   */
  async getUserRoles(userId: string) {
    return this.usersRepository.getUserRoles(userId);
  }

  async replaceUserRoles(userId: string, roleIds: string[]) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    const uniqueRoleIds = Array.from(new Set(roleIds));
    const existingRoles =
      await this.usersRepository.findRolesByIds(uniqueRoleIds);
    const existingRoleIdSet = new Set(existingRoles.map((role) => role.id));
    const invalidRoleIds = uniqueRoleIds.filter(
      (id) => !existingRoleIdSet.has(id),
    );

    await this.drizzle.transaction(async (tx) => {
      await this.usersRepository.replaceUserRoles(
        userId,
        existingRoles.map((role) => role.id),
        tx,
      );
    });

    const updatedRoles = await this.usersRepository.getUserRoles(userId);

    return {
      userId,
      roles: updatedRoles,
      ignoredRoleIds: invalidRoleIds,
      warning:
        invalidRoleIds.length > 0
          ? 'Some roleIds were ignored because they do not exist'
          : undefined,
    };
  }

  /**
   * Check if user is a coordinator of a specific department
   */
  async isCoordinatorOfDepartment(
    userId: string,
    departmentId: string,
  ): Promise<boolean> {
    return this.usersRepository.isCoordinatorOfDepartment(userId, departmentId);
  }

  /**
   * Get all permission keys for a user
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    return this.usersRepository.getUserPermissions(userId);
  }

  /**
   * Get users in selector format (lightweight for dropdowns)
   * Optionally filter by role
   */
  async getSelector(
    searchQuery?: string,
    roleName?: string,
    limit: number = 50,
  ): Promise<UserSelectorDto[]> {
    return this.usersRepository.findForSelector(searchQuery, roleName, limit);
  }

  /**
   * Find multiple users by IDs (bulk query)
   * Useful for avoiding N+1 queries when fetching user details
   *
   * @param userIds Array of user IDs
   * @returns Array of users found
   */
  async findByIds(userIds: string[]): Promise<User[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.usersRepository.findByIds(userIds);
  }

  async getUsers(query: GetUsersQueryDto): Promise<UsersListResponse> {
    const [totalItems, rows] = await Promise.all([
      this.usersRepository.countUsersForAdminList(query),
      this.usersRepository.findUsersForAdminList(query),
    ]);

    const grouped = new Map<
      string,
      {
        id: string;
        fullName: string | null;
        email: string;
        departmentId: string | null;
        departmentName: string | null;
        universityId: string | null;
        phoneNumber: string | null;
        isExternal: boolean;
        accountStatus: 'active' | 'deactive' | 'suspended';
        avatarUrl: string | null;
        createdAt: Date | null;
        roles: Array<{ id: string; name: string }>;
      }
    >();

    for (const row of rows) {
      if (!grouped.has(row.id)) {
        grouped.set(row.id, {
          id: row.id,
          fullName: row.fullName,
          email: row.email,
          departmentId: row.departmentId,
          departmentName: row.departmentName ?? null,
          universityId: row.universityId,
          phoneNumber: row.phoneNumber,
          isExternal: row.isExternal ?? false,
          accountStatus: row.accountStatus,
          avatarUrl: row.avatarUrl,
          createdAt: row.createdAt,
          roles: [],
        });
      }

      if (row.roleId && row.roleName) {
        const user = grouped.get(row.id)!;
        if (!user.roles.some((role) => role.id === row.roleId)) {
          user.roles.push({ id: row.roleId, name: row.roleName });
        }
      }
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return {
      items: Array.from(grouped.values()),
      meta: buildPaginationMeta(page, limit, totalItems),
    };
  }

  async getUserById(userId: string): Promise<UserDetailResponse> {
    const [user, roles, coordinatorDepartments] = await Promise.all([
      this.usersRepository.findUserDetailById(userId),
      this.usersRepository.getUserRoles(userId),
      this.usersRepository.getCoordinatorDepartments(userId),
    ]);

    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      departmentId: user.departmentId,
      departmentName: user.departmentName ?? null,
      universityId: user.universityId,
      university: user.university,
      phoneNumber: user.phoneNumber,
      isExternal: user.isExternal ?? false,
      accountStatus: user.accountStatus,
      avatarUrl: user.avatarUrl,
      roles: roles
        .filter((role) => role.roleName !== null)
        .map((role) => ({
          id: role.roleId,
          name: role.roleName as string,
          grantedAt: role.grantedAt,
        })),
      departmentCoordination: {
        isCoordinator: coordinatorDepartments.length > 0,
        departments: coordinatorDepartments.map((department) => ({
          id: department.id,
          name: department.name,
          code: department.code,
          assignedAt: department.assignedAt,
        })),
      },
      createdAt: user.createdAt,
    };
  }
}
