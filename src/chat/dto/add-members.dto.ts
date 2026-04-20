import {
  IsArray,
  IsString,
  ArrayMinSize,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';

/**
 * DTO for adding members to a group chat
 * POST /chats/:id/members
 */
export class AddMembersDto {
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each user ID must be a valid UUID' })
  @ArrayMinSize(1, {
    message: 'Must provide at least 1 user to add',
  })
  @ArrayMaxSize(100, {
    message: 'Cannot add more than 100 users at once',
  })
  userIds: string[];
}
