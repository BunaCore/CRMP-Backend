import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for sending a message to a chat
 */
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: 'Message cannot be empty' })
  @MaxLength(5000, { message: 'Message cannot exceed 5000 characters' })
  content: string;
}
