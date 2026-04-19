import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';

/**
 * DTO for adding members to a group chat
 * POST /chats/:id/members
 */
export class AddMembersDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1, {
    message: 'Must provide at least 1 user to add',
  })
  @ArrayMaxSize(100, {
    message: 'Cannot add more than 100 users at once',
  })
  userIds: string[];
}
