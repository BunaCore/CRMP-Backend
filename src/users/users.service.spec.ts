import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RolesRepository } from 'src/db/roles.repository';
import { DrizzleService } from 'src/db/db.service';
import { MailProducer } from 'src/queues/mail/mail.producer';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService - invitations', () => {
  let service: UsersService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let rolesRepository: jest.Mocked<RolesRepository>;
  let mailProducer: jest.Mocked<MailProducer>;

  beforeEach(() => {
    usersRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      createInvitation: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;

    rolesRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<RolesRepository>;

    mailProducer = {
      addInvitationEmailJob: jest.fn(),
    } as unknown as jest.Mocked<MailProducer>;

    const drizzleService = {} as DrizzleService;
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'INVITATION_ACCEPT_URL') {
          return 'https://app.example.com/onboarding/invite';
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new UsersService(
      usersRepository,
      drizzleService,
      rolesRepository,
      mailProducer,
      configService,
    );
  });

  it('creates an invitation and queues email', async () => {
    usersRepository.findById.mockResolvedValue({
      id: 'inviter-id',
      email: 'inviter@example.com',
      fullName: 'Inviter',
    } as any);
    usersRepository.findByEmail.mockResolvedValue(null);
    rolesRepository.findById.mockResolvedValue({
      id: 'role-id',
      name: 'STUDENT',
    } as any);
    usersRepository.createInvitation.mockResolvedValue({
      id: 'invitation-id',
      email: 'invitee@example.com',
      roleId: 'role-id',
      expiresAt: new Date(Date.now() + 3600_000),
      createdAt: new Date(),
    } as any);
    mailProducer.addInvitationEmailJob.mockResolvedValue({} as any);

    const result = await service.inviteUser('inviter-id', {
      email: 'invitee@example.com',
      roleId: 'role-id',
    });

    expect(result.email).toBe('invitee@example.com');
    expect(usersRepository.createInvitation).toHaveBeenCalledTimes(1);
    expect(mailProducer.addInvitationEmailJob).toHaveBeenCalledTimes(1);
  });

  it('throws conflict when invited email already exists', async () => {
    usersRepository.findById.mockResolvedValue({
      id: 'inviter-id',
      email: 'inviter@example.com',
    } as any);
    usersRepository.findByEmail.mockResolvedValue({
      id: 'existing-user',
    } as any);

    await expect(
      service.inviteUser('inviter-id', {
        email: 'existing@example.com',
        roleId: 'role-id',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws not found when role is missing', async () => {
    usersRepository.findById.mockResolvedValue({
      id: 'inviter-id',
      email: 'inviter@example.com',
    } as any);
    usersRepository.findByEmail.mockResolvedValue(null);
    rolesRepository.findById.mockResolvedValue(null as any);

    await expect(
      service.inviteUser('inviter-id', {
        email: 'invitee@example.com',
        roleId: 'missing-role',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
