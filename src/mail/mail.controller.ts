import { Controller, Post, Body } from '@nestjs/common';
import { IsEmail, IsEnum, IsObject } from 'class-validator';
import { MailService } from './mail.service';
import { EmailType } from './dto/email-type.enum';

class TestMailDto {
  @IsEmail()
  email: string;

  @IsEnum(EmailType)
  type: EmailType;

  @IsObject()
  context: Record<string, any>;
}

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('test')
  async sendTestEmail(@Body() dto: TestMailDto) {
    try {
      await this.mailService.sendEmail(dto.type, dto.email, dto.context);
      return { message: 'Test email sent successfully' };
    } catch (error) {
      return { message: 'Failed to send email', error: error.message };
    }
  }
}