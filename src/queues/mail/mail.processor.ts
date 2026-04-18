import { Process, Processor, OnQueueError, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { MailService } from 'src/mail/mail.service';
import { EmailType } from 'src/mail/dto/email-type.enum';
import {
  WelcomeEmailJobData,
  ProposalStatusEmailJobData,
  DefenseScheduledEmailJobData,
  PasswordResetEmailJobData,
} from './mail.types';

/**
 * MailProcessor: executes queued email jobs
 * BullMQ calls these methods automatically when jobs are ready
 */
@Processor('mail')
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private mailService: MailService) {}

  /**
   * Process welcome email job
   */
  @Process('welcome-email')
  async handleWelcomeEmail(job: Job<WelcomeEmailJobData>) {
    const { email, fullName } = job.data;

    this.logger.log(`Processing welcome email for ${email}`);

    try {
      await this.mailService.sendEmail(EmailType.WELCOME, email, {
        fullName: fullName || 'User',
      });
      this.logger.log(`Welcome email sent to ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send welcome email to ${email}: ${errorMessage}`,
      );
      throw error; // Re-throw for auto-retry
    }
  }

  /**
   * Process proposal status notification email job
   */
  @Process('proposal-status-email')
  async handleProposalStatusEmail(job: Job<ProposalStatusEmailJobData>) {
    const { email, proposalTitle, newStatus } = job.data;

    this.logger.log(
      `Processing proposal status email for ${email} - Status: ${newStatus}`,
    );

    try {
      await this.mailService.sendEmail(
        EmailType.PROPOSAL_STATUS_CHANGED,
        email,
        {
          proposalTitle,
          newStatus,
        },
      );
      this.logger.log(`Proposal status email sent to ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send proposal status email to ${email}: ${errorMessage}`,
      );
      throw error; // Re-throw for auto-retry
    }
  }

  /**
   * Process defense scheduled notification email job
   */
  @Process('defense-scheduled-email')
  async handleDefenseScheduledEmail(job: Job<DefenseScheduledEmailJobData>) {
    const { email, proposalTitle, defenseDate, location } = job.data;

    this.logger.log(
      `Processing defense scheduled email for ${email} - Date: ${defenseDate}`,
    );

    try {
      await this.mailService.sendEmail(EmailType.DEFENSE_SCHEDULED, email, {
        proposalTitle,
        defenseDate: new Date(defenseDate).toLocaleString(),
        location: location || 'TBD',
      });
      this.logger.log(`Defense scheduled email sent to ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send defense scheduled email to ${email}: ${errorMessage}`,
      );
      throw error; // Re-throw for auto-retry
    }
  }

  /**
   * Process password reset email job
   */
  @Process('password-reset-email')
  async handlePasswordResetEmail(job: Job<PasswordResetEmailJobData>) {
    const { email, resetLink } = job.data;

    this.logger.log(`Processing password reset email for ${email}`);

    try {
      await this.mailService.sendEmail(EmailType.PASSWORD_RESET, email, {
        resetLink,
      });
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send password reset email to ${email}: ${errorMessage}`,
      );
      throw error; // Re-throw for auto-retry
    }
  }

  /**
   * Global error handler for all mail jobs
   */
  @OnQueueError()
  async onError(error: Error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`Mail queue error: ${errorMessage}`, error?.stack);
  }

  /**
   * Handle job failures after all retries exhausted
   */
  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(
      `Mail job ${job.id} failed after ${job.attemptsMade} attempts: ${errorMessage}`,
    );
    // Could integrate alerting here (Slack, PagerDuty, etc.)
  }
}
