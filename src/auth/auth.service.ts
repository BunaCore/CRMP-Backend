import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersRepository } from 'src/users/users.repository';
import { RolesRepository } from 'src/db/roles.repository';
import { DepartmentsRepository } from 'src/departments/departments.repository';
import { DrizzleService } from 'src/db/db.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponse } from 'src/types/auth-response';
import { UserWithPermissions } from 'src/types/user-with-permissions';
import { MailService } from 'src/mail/mail.service';
import { EmailType } from 'src/mail/dto/email-type.enum';
import { Permission } from 'src/access-control/permission.enum';

import * as bcrypt from 'bcrypt';
import { DB } from 'src/db/db.type';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { createHash } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersRepository: UsersRepository,
    private rolesRepository: RolesRepository,
    private departmentsRepository: DepartmentsRepository,
    private drizzleService: DrizzleService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  /**
   * Register a new user with transactional role assignment
   * Creates user, assigns STUDENT role, and validates department (if provided)
   * Auto-rolls back on any failure
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    // Check if email already registered
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    // Validate department if provided
    if (dto.departmentId) {
      const department = await this.departmentsRepository.findById(
        dto.departmentId,
      );
      if (!department) {
        throw new NotFoundException(
          `Department with ID ${dto.departmentId} not found`,
        );
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Get STUDENT role
    const studentRole = await this.rolesRepository.findByName('STUDENT');
    if (!studentRole) {
      throw new NotFoundException('STUDENT role not found in database');
    }

    // Transaction: Create user + assign role + generate tokens
    const { user, tokens } = await this.drizzleService.transaction(
      async (tx) => {
        // Create user within transaction
        const createdUser = await this.usersRepository.createWithTx(
          {
            email: dto.email,
            passwordHash,
            fullName: dto.fullName,
            department: dto.departmentId, // Now stores UUID of department
            phoneNumber: dto.phoneNumber,
            university: dto.university,
            universityId: dto.universityId,
            accountStatus: 'deactive',
          },
          tx,
        );

        // Assign STUDENT role within transaction
        await this.usersRepository.assignRole(
          createdUser.id,
          studentRole.id,
          tx,
        );

        // Generate and save tokens within transaction
        const generatedTokens = await this.generateTokensPersist(
          createdUser.id,
          'STUDENT',
          tx,
        );

        return { user: createdUser, tokens: generatedTokens };
      },
    );

    // Send welcome email after successful registration
    this.mailService.sendEmail(EmailType.WELCOME, user.email, {
      recipientName: user.fullName,
    });

    // Fetch permissions and build response
    const permissions = await this.usersRepository.getUserPermissions(user.id);
    const roles = await this.usersRepository.getUserRoles(user.id);
    const roleNames = roles.map((r) => r.roleName).filter(Boolean) as string[];

    const userWithPermissions: UserWithPermissions = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      phoneNumber: user.phoneNumber,
      university: user.university,
      universityId: user.universityId,
      roles: roleNames,
      permissions,
      canAccessAdmin: permissions.includes(Permission.ADMIN_VIEW),
      accountStatus: user.accountStatus,
      createdAt: user.createdAt,
    };

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: userWithPermissions,
    };
  }

  /**
   * Login user with credentials
   * Returns tokens and user with permissions
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Fetch permissions and roles
    const permissions = await this.usersRepository.getUserPermissions(user.id);
    const roles = await this.usersRepository.getUserRoles(user.id);
    const roleNames = roles.map((r) => r.roleName).filter(Boolean) as string[];

    const tokens = await this.generateTokens(user.id, roleNames[0]);

    const userWithPermissions: UserWithPermissions = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      phoneNumber: user.phoneNumber,
      university: user.university,
      universityId: user.universityId,
      roles: roleNames,
      permissions,
      canAccessAdmin: permissions.includes(Permission.ADMIN_VIEW),
      accountStatus: user.accountStatus,
      createdAt: user.createdAt,
    };

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: userWithPermissions,
    };
  }

  async acceptInvitation(dto: AcceptInvitationDto): Promise<AuthResponse> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const invitation =
      await this.usersRepository.findInvitationByTokenHash(tokenHash);

    if (!invitation) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    if (invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    const existingUser = await this.usersRepository.findByEmail(
      invitation.email,
    );
    if (existingUser) {
      throw new ConflictException(
        'An account with this invitation email already exists',
      );
    }

    if (!invitation.roleId) {
      throw new BadRequestException('Invitation role is no longer available');
    }

    const role = await this.rolesRepository.findById(invitation.roleId);
    if (!role) {
      throw new NotFoundException('Invitation role was not found');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const { user, tokens } = await this.drizzleService.transaction(
      async (tx) => {
        const createdUser = await this.usersRepository.createWithTx(
          {
            email: invitation.email,
            passwordHash,
            fullName: dto.fullName,
            phoneNumber: dto.phoneNumber,
            university: dto.university,
            universityId: dto.universityId,
            accountStatus: 'deactive',
          },
          tx,
        );
        if (invitation.roleId) {
          await this.usersRepository.assignRole(
            createdUser.id,
            invitation.roleId,
            tx,
          );
        }
        await this.usersRepository.markInvitationAccepted(invitation.id, tx);

        const generatedTokens = await this.generateTokensPersist(
          createdUser.id,
          role.name,
          tx,
        );

        return { user: createdUser, tokens: generatedTokens };
      },
    );

    const permissions = await this.usersRepository.getUserPermissions(user.id);
    const roles = await this.usersRepository.getUserRoles(user.id);
    const roleNames = roles.map((r) => r.roleName).filter(Boolean) as string[];

    const userWithPermissions: UserWithPermissions = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      phoneNumber: user.phoneNumber,
      university: user.university,
      universityId: user.universityId,
      roles: roleNames,
      permissions,
      canAccessAdmin: permissions.includes(Permission.ADMIN_VIEW),
      accountStatus: user.accountStatus,
      createdAt: user.createdAt,
    };

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: userWithPermissions,
    };
  }

  /**
   * Get invitation details by token (for frontend pre-population before acceptance)
   * Validates token is valid and not expired
   * Returns email and role info so frontend can pre-populate form
   */
  async getInvitationDetails(token: string): Promise<{
    email: string;
    roleName: string;
    expiresAt: Date;
  }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitation =
      await this.usersRepository.findInvitationByTokenHash(tokenHash);

    if (!invitation) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    if (invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    if (!invitation.roleId) {
      throw new BadRequestException('Invitation role is no longer available');
    }

    const role = await this.rolesRepository.findById(invitation.roleId);
    if (!role) {
      throw new NotFoundException('Invitation role was not found');
    }

    return {
      email: invitation.email,
      roleName: role.name,
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Get current user (from JWT)
   * Returns user with permissions
   */
  async getCurrentUser(userId: string): Promise<UserWithPermissions> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const permissions = await this.usersRepository.getUserPermissions(userId);
    const roles = await this.usersRepository.getUserRoles(userId);
    const roleNames = roles.map((r) => r.roleName).filter(Boolean) as string[];

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      phoneNumber: user.phoneNumber,
      university: user.university,
      universityId: user.universityId,
      roles: roleNames,
      permissions,
      canAccessAdmin: permissions.includes(Permission.ADMIN_VIEW),
      accountStatus: user.accountStatus,
      createdAt: user.createdAt,
    };
  }

  /**
   * Generate access and refresh tokens
   * @param userId - User ID
   * @param role - User's primary role
   */
  private async generateTokens(
    userId: string,
    role: string = 'user',
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessTokenExpiresIn =
      this.configService.get<string>('JWT_EXPIRATION_MS') || '3600000'; // 1 hour default

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        role,
      },
      {
        expiresIn: parseInt(accessTokenExpiresIn, 10) / 1000, // Convert ms to seconds
      },
    );

    const refreshTokenExpiresIn = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenExpiresIn);

    const refreshToken = this.jwtService.sign(
      {
        sub: userId,
        type: 'refresh',
      },
      {
        expiresIn: refreshTokenExpiresIn / 1000,
      },
    );

    // Save refresh token to database (outside transaction)
    await this.usersRepository.saveRefreshToken(
      userId,
      refreshToken,
      refreshTokenExpiresAt,
    );

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Generate tokens with transaction support
   * Used during registration to persist refresh token within the user creation transaction
   * @param userId - User ID
   * @param role - User's primary role
   * @param tx - Transaction context
   */
  private async generateTokensPersist(
    userId: string,
    role: string,
    tx: DB,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessTokenExpiresIn =
      this.configService.get<string>('JWT_EXPIRATION_MS') || '3600000'; // 1 hour default

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        role,
      },
      {
        expiresIn: parseInt(accessTokenExpiresIn, 10) / 1000, // Convert ms to seconds
      },
    );

    const refreshTokenExpiresIn = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenExpiresIn);

    const refreshToken = this.jwtService.sign(
      {
        sub: userId,
        type: 'refresh',
      },
      {
        expiresIn: refreshTokenExpiresIn / 1000,
      },
    );

    // Save refresh token to database within transaction
    await this.usersRepository.saveRefreshToken(
      userId,
      refreshToken,
      refreshTokenExpiresAt,
      tx,
    );

    return {
      accessToken,
      refreshToken,
    };
  }
}
