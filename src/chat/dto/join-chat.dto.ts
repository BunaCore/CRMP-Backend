import { IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO for joining a chat room
 */
export class JoinChatDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;
}
