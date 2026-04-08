import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { EmailType } from './dto/email-type.enum';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly emailConfigs = {
    [EmailType.DEFENSE_SCHEDULED]: {
      template: 'defense-scheduled',
      subject: 'Defense Scheduled',
    },
    [EmailType.PROPOSAL_STATUS_CHANGED]: {
      template: 'proposal-status',
      subject: 'Proposal Status Changed',
    },
    [EmailType.WELCOME]: {
      template: 'welcome',
      subject: 'Welcome to CRMP',
    },
    [EmailType.PASSWORD_RESET]: {
      template: 'password-reset',
      subject: 'Password Reset',
    },
  };

  constructor(private readonly mailerService: MailerService) {}

  private isValidEmail(email: string): boolean {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async sendEmail(type: EmailType, to: string, context: Record<string, any>): Promise<void> {
    const config = this.emailConfigs[type];
    if (!config) {
      this.logger.warn(`Skipped email send because unknown email type: ${type}`);
      return;
    }

    if (!this.isValidEmail(to)) {
      this.logger.warn(`Skipped email send because invalid recipient email: ${to}`);
      return;
    }

    try {
      const templatePath = path.join(__dirname, 'templates', `${config.template}.hbs`);
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = handlebars.compile(templateSource);
      const body = template(context);

      await this.mailerService.sendMail({
        to,
        subject: config.subject,
        template: 'base',
        context: { body, ...context },
      });
    } catch (error) {
      this.logger.warn(`Failed to send email of type ${type} to ${to}: ${error?.message || error}`);
    }
  }
}