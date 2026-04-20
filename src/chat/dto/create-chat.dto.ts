import {
  IsString,
  IsEnum,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsOptional,
  ValidateIf,
  IsUUID,
} from 'class-validator';

/**
 * DTO for creating a new chat (DM or group)
 * Unified endpoint handles both cases
 */
export class CreateChatDto {
  @IsEnum(['dm', 'group'])
  type: 'dm' | 'group';

  /**
   * Array of user IDs to add to chat
   * - For DM: must be exactly 1 user
   * - For group: can be 1 or many
   * Current user is added implicitly
   */
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1, {
    message: 'Must provide at least 1 member',
  })
  @ArrayMaxSize(100, {
    message: 'Cannot add more than 100 members',
  })
  memberIds: string[];

  /**
   * Chat name (required for groups, ignored for DMs)
   */
  @IsOptional()
  @ValidateIf((o) => o.type === 'group')
  @IsString()
  name?: string;
}
