import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { User, CreateUserInput } from 'src/users/types/user';
import { UserSelectorDto } from 'src/types/selector';
import { DrizzleService } from 'src/db/db.service';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { buildPaginationMeta } from 'src/common/pagination/utils/build-pagination-meta';
import { UsersListResponse } from './types/user-admin-list.type';
import { UserDetailResponse } from './types/user-detail.type';
import { RolesRepository } from 'src/db/roles.repository';
import { MailProducer } from 'src/queues/mail/mail.producer';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AccountStatusValue } from './dto/update-user-status.dto';
import { UpdateSelfProfileDto } from './dto/update-self-profile.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { Permission } from 'src/access-control/permission.enum';
import { UserWithPermissions } from 'src/types/user-with-permissions';
import { FilesService } from 'src/common/files/files.service';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import {
  AuditAction,
  AuditActionValue,
} from 'src/audit-logs/types/audit-action.enum';
import { MlService } from 'src/ml/ml.service';

@Injectable()
export class UsersService {
  private static readonly DEFAULT_INVITATION_EXPIRATION_HOURS = 72;

  constructor(
    private usersRepository: UsersRepository,
    private readonly drizzle: DrizzleService,
    private readonly rolesRepository: RolesRepository,
    private readonly mailProducer: MailProducer,
    private readonly configService: ConfigService,
    private readonly filesService: FilesService,
    private readonly auditLogsService: AuditLogsService,
    private readonly mlService: MlService,
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

  async replaceUserRoles(
    userId: string,
    roleIds: string[],
    actorUserId?: string,
  ) {
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

    void this.logAudit({
      actorUserId: actorUserId ?? userId,
      action: AuditAction.PERMISSION_CHANGED,
      entityType: 'user_roles',
      entityId: userId,
      metadata: {
        operation: 'REPLACE_USER_ROLES',
        roleIds,
        ignoredRoleIds: invalidRoleIds,
      },
    });

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
    const dbUsers = await this.usersRepository.findForSelector(searchQuery, roleName, limit);
    
    // If no search query is provided, return standard DB options directly
    if (!searchQuery) {
      return dbUsers;
    }

    let mlRecs: any[] = [];
    try {
      // Query semantic suggestions from FastAPI ML service
      const mlRes = await this.mlService.searchMembers(searchQuery, limit);
      mlRecs = mlRes?.recommendations || [];
    } catch (e) {
      console.warn('Failed to fetch semantic collaborator recommendations from ML:', e.message);
    }

    if (mlRecs.length === 0) {
      return dbUsers;
    }

    // Deduplicate: filter out ML recommendations that are already matched by exact name in dbUsers
    const dbUserIds = new Set(dbUsers.map(u => u.value));
    const newMlRecs = mlRecs.filter(rec => !dbUserIds.has(rec.id));

    if (newMlRecs.length === 0) {
      return dbUsers;
    }

    // Bulk-fetch DB metadata for these additional recommended users
    const newMlUserIds = newMlRecs.map(rec => rec.id);
    const mlUsersDetail = await this.usersRepository.findByIds(newMlUserIds);

    // Map to UserSelectorDto and attach score/reason
    const mlUsersMapped: UserSelectorDto[] = mlUsersDetail.map(user => {
      const rec = newMlRecs.find(r => r.id === user.id);
      return {
        label: user.fullName || user.id,
        value: user.id,
        meta: {
          department: user.department || undefined,
          isExternal: user.isExternal || false,
          score: rec ? rec.score : undefined,
          reason: rec && user.department ? `Specialist in ${user.department}` : 'Semantic match',
        }
      };
    });

    // Sort by recommendation score descending
    mlUsersMapped.sort((a, b) => ((b.meta as any)?.score || 0) - ((a.meta as any)?.score || 0));

    // Combine exact/partial name DB matches first, then append semantic recommendations
    return [...dbUsers, ...mlUsersMapped].slice(0, limit);
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

    const supportingDocument = user.supportingDocumentFileId
      ? await this.filesService.getFileWithAccess(user.supportingDocumentFileId)
      : null;

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      departmentId: user.departmentId,
      departmentName: user.departmentName ?? null,
      universityId: user.universityId,
      university: user.university,
      userProgram: user.userProgram ?? null,
      phoneNumber: user.phoneNumber,
      isExternal: user.isExternal ?? false,
      supportingDocumentFileId: user.supportingDocumentFileId ?? null,
      supportingDocument,
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

  async inviteUser(invitedBy: string, dto: CreateInvitationDto) {
    const inviter = await this.usersRepository.findById(invitedBy);
    if (!inviter) {
      throw new NotFoundException(`Inviter "${invitedBy}" not found`);
    }

    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.usersRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const role = await this.rolesRepository.findById(dto.roleId);
    if (!role) {
      throw new NotFoundException(`Role "${dto.roleId}" not found`);
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresInHours =
      dto.expiresInHours ?? UsersService.DEFAULT_INVITATION_EXPIRATION_HOURS;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const invitationBaseUrl =
      this.configService.get<string>('INVITATION_ACCEPT_URL') ||
      this.configService.get<string>('FRONTEND_URL');
    if (!invitationBaseUrl) {
      throw new BadRequestException(
        'Invitation URL is not configured (INVITATION_ACCEPT_URL or FRONTEND_URL)',
      );
    }

    const separator = invitationBaseUrl.includes('?') ? '&' : '?';
    const invitationLink = `${invitationBaseUrl}${separator}token=${encodeURIComponent(token)}`;

    const invitation = await this.usersRepository.createInvitation({
      email,
      tokenHash,
      invitedBy,
      roleId: dto.roleId,
      expiresAt,
    });

    await this.mailProducer.addInvitationEmailJob({
      email,
      invitationLink,
      roleName: role.name,
      invitedByName: inviter.fullName || inviter.email,
      expiresAt,
    });

    void this.logAudit({
      actorUserId: invitedBy,
      action: AuditAction.CREATED,
      entityType: 'invitations',
      entityId: invitation.id,
      metadata: {
        operation: 'INVITE_USER',
        email,
        roleId: dto.roleId,
        expiresAt,
      },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      roleId: invitation.roleId,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  async updateUserStatus(
    userId: string,
    status: AccountStatusValue,
    actorUserId?: string,
  ) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    const updatedUser = await this.usersRepository.update(userId, {
      accountStatus: status,
    });

    if (!updatedUser) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    void this.logAudit({
      actorUserId: actorUserId ?? userId,
      action: AuditAction.STATUS_CHANGED,
      entityType: 'users',
      entityId: userId,
      metadata: {
        operation: 'UPDATE_USER_STATUS',
        status,
      },
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      accountStatus: updatedUser.accountStatus,
      updatedAt: new Date().toISOString(),
    };
  }

  async updateSelfProfile(
    userId: string,
    dto: UpdateSelfProfileDto,
  ): Promise<UserWithPermissions> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    const updatedUser = await this.usersRepository.update(userId, {
      fullName: dto.fullName,
      phoneNumber: dto.phoneNumber,
    });

    if (!updatedUser) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    void this.logAudit({
      actorUserId: userId,
      action: AuditAction.UPDATED,
      entityType: 'users',
      entityId: userId,
      metadata: {
        operation: 'UPDATE_SELF_PROFILE',
        fullName: dto.fullName ?? null,
        phoneNumber: dto.phoneNumber ?? null,
      },
    });

    return this.buildUserWithPermissions(updatedUser);
  }

  async updateUserByAdmin(
    userId: string,
    dto: UpdateUserAdminDto,
    actor: { id: string },
  ): Promise<UserWithPermissions> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.usersRepository.findByEmail(dto.email);
      if (existing && existing.id !== userId) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    if (dto.departmentId) {
      const departmentExists = await this.usersRepository.departmentExists(
        dto.departmentId,
      );
      if (!departmentExists) {
        throw new NotFoundException(
          `Department with ID "${dto.departmentId}" not found`,
        );
      }
    }

    const roles = await this.usersRepository.getUserRoles(userId);
    const roleNames = roles
      .map((role) => role.roleName)
      .filter(Boolean) as string[];
    const isStudent = roleNames.includes('STUDENT');

    if (!isStudent && dto.userProgram) {
      throw new BadRequestException(
        'userProgram can only be set for STUDENT users',
      );
    }

    const updateInput: Partial<CreateUserInput> = {
      fullName: dto.fullName,
      phoneNumber: dto.phoneNumber,
      email: dto.email,
      departmentId: dto.departmentId,
      department: dto.department,
      university: dto.university,
      universityId: dto.universityId,
      isExternal: dto.isExternal,
      accountStatus: dto.accountStatus,
    };

    if (isStudent && dto.userProgram) {
      updateInput.userProgram = dto.userProgram;
    }

    const updatedUser = await this.usersRepository.update(userId, updateInput);

    if (!updatedUser) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    void this.logAudit({
      actorUserId: actor.id,
      action: AuditAction.UPDATED,
      entityType: 'users',
      entityId: userId,
      metadata: {
        operation: 'UPDATE_USER_BY_ADMIN',
        fullName: dto.fullName ?? null,
        email: dto.email ?? null,
        departmentId: dto.departmentId ?? null,
        isExternal: dto.isExternal ?? null,
        accountStatus: dto.accountStatus ?? null,
        userProgram: dto.userProgram ?? null,
      },
    });

    return this.buildUserWithPermissions(updatedUser);
  }

  private async logAudit(input: {
    actorUserId?: string | null;
    action: AuditActionValue;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, any> | null;
  }) {
    try {
      await this.auditLogsService.record(input);
    } catch (error) {
      console.warn(
        `Failed to record audit log for ${input.entityType}/${input.entityId ?? 'n/a'}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async buildUserWithPermissions(
    user: User,
  ): Promise<UserWithPermissions> {
    const permissions = await this.usersRepository.getUserPermissions(user.id);
    const roles = await this.usersRepository.getUserRoles(user.id);
    const roleNames = roles
      .map((role) => role.roleName)
      .filter(Boolean) as string[];

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      phoneNumber: user.phoneNumber,
      university: user.university,
      universityId: user.universityId,
      userProgram: user.userProgram,
      roles: roleNames,
      permissions,
      canAccessAdmin: permissions.includes(Permission.ADMIN_VIEW),
      accountStatus: user.accountStatus,
      createdAt: user.createdAt,
    };
  }
}
