import { IsString } from 'class-validator';

export class WelcomeEmailDto {
  @IsString()
  recipientName: string;
}