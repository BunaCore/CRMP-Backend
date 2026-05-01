import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';
import {
  WelcomeEmailJobData,
  ProposalStatusEmailJobData,
  DefenseScheduledEmailJobData,
  PasswordResetEmailJobData,
  InvitationEmailJobData,
} from './mail.types';

/**
 * MailProducer: adds email jobs to the queue
 * Services inject this to queue emails without blocking
 */
@Injectable()
export class MailProducer {
  private readonly logger = new Logger(MailProducer.name);

  constructor(@InjectQueue('mail') private mailQueue: Queue) {}

  /**
   * Queue a welcome email job
   * Called when user registers
   */
  async addWelcomeEmailJob(data: WelcomeEmailJobData): Promise<Job> {
    const job = await this.mailQueue.add('welcome-email', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
    });

    this.logger.log(`Queued welcome email job ${job.id} for ${data.email}`);
    return job;
  }

  /**
   * Queue a proposal status notification email job
   * Called when proposal status changes
   */
  async addProposalStatusEmailJob(
    data: ProposalStatusEmailJobData,
  ): Promise<Job> {
    const job = await this.mailQueue.add('proposal-status-email', data, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000,
      },
      removeOnComplete: true,
    });

    this.logger.log(
      `Queued proposal status email job ${job.id} for ${data.email}`,
    );
    return job;
  }

  /**
   * Queue a defense scheduled notification email job
   * Called when defense is scheduled
   */
  async addDefenseScheduledEmailJob(
    data: DefenseScheduledEmailJobData,
  ): Promise<Job> {
    const job = await this.mailQueue.add('defense-scheduled-email', data, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000,
      },
      removeOnComplete: true,
    });

    this.logger.log(
      `Queued defense scheduled email job ${job.id} for ${data.email}`,
    );
    return job;
  }

  /**
   * Queue a password reset email job
   * Called when user requests password reset
   */
  async addPasswordResetEmailJob(
    data: PasswordResetEmailJobData,
  ): Promise<Job> {
    const job = await this.mailQueue.add('password-reset-email', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
    });

    this.logger.log(
      `Queued password reset email job ${job.id} for ${data.email}`,
    );
    return job;
  }

  /**
   * Queue an invitation onboarding email job
   */
  async addInvitationEmailJob(data: InvitationEmailJobData): Promise<Job> {
    const job = await this.mailQueue.add('invitation-email', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
    });

    this.logger.log(`Queued invitation email job ${job.id} for ${data.email}`);
    return job;
  }
}
