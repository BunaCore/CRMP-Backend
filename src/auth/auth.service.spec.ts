import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersRepository } from 'src/users/users.repository';
import { RolesRepository } from 'src/db/roles.repository';
import { DepartmentsRepository } from 'src/departments/departments.repository';
import { DrizzleService } from 'src/db/db.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from 'src/mail/mail.service';

describe('AuthService - invitation acceptance', () => {
  let authService: AuthService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let rolesRepository: jest.Mocked<RolesRepository>;
  let drizzleService: jest.Mocked<DrizzleService>;

  beforeEach(async () => {
    usersRepository = {
      findInvitationByTokenHash: jest.fn(),
      findByEmail: jest.fn(),
      createWithTx: jest.fn(),
      assignRole: jest.fn(),
      markInvitationAccepted: jest.fn(),
      saveRefreshToken: jest.fn(),
      getUserPermissions: jest.fn(),
      getUserRoles: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;

    rolesRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<RolesRepository>;

    drizzleService = {
      transaction: jest.fn(),
    } as unknown as jest.Mocked<DrizzleService>;

    const departmentsRepository = {} as DepartmentsRepository;
    const jwtService = {
      sign: jest.fn().mockReturnValue('jwt-token'),
    } as unknown as JwtService;
    const configService = {
      get: jest.fn().mockReturnValue('3600000'),
    } as unknown as ConfigService;
    const mailService = {} as MailService;

    authService = new AuthService(
      usersRepository,
      rolesRepository,
      departmentsRepository,
      drizzleService,
      jwtService,
      configService,
      mailService,
    );
  });

  it('rejects invalid token', async () => {
    usersRepository.findInvitationByTokenHash.mockResolvedValue(null as any);

    await expect(
      authService.acceptInvitation({
        token: 'invalid',
        password: 'securePassword123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when user already exists for invitation email', async () => {
    usersRepository.findInvitationByTokenHash.mockResolvedValue({
      id: 'invitation-id',
      email: 'existing@example.com',
      roleId: 'role-id',
      expiresAt: new Date(Date.now() + 3600_000),
      acceptedAt: null,
    } as any);
    usersRepository.findByEmail.mockResolvedValue({
      id: 'existing-user',
    } as any);

    await expect(
      authService.acceptInvitation({
        token: 'valid-token',
        password: 'securePassword123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when invitation role does not exist', async () => {
    usersRepository.findInvitationByTokenHash.mockResolvedValue({
      id: 'invitation-id',
      email: 'new@example.com',
      roleId: 'missing-role',
      expiresAt: new Date(Date.now() + 3600_000),
      acceptedAt: null,
    } as any);
    usersRepository.findByEmail.mockResolvedValue(null);
    rolesRepository.findById.mockResolvedValue(null as any);

    await expect(
      authService.acceptInvitation({
        token: 'valid-token',
        password: 'securePassword123',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
