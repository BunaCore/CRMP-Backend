import { IsUUID, IsArray, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for adding members to a proposal
 * Allows bulk add with duplicate filtering
 */
export class AddMembersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemberInput)
  @IsNotEmpty()
  members: MemberInput[];
}

export class MemberInput {
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}

/**
 * DTO for removing members from a proposal
 * Accept array of user IDs to remove
 */
export class RemoveMembersDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  userIds: string[];
}

/**
 * DTO for assigning a single advisor
 * Replaces existing advisor if one exists
 */
export class AssignAdvisorDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}

/**
 * DTO for assigning evaluators
 * Adds to existing evaluators (multiple allowed)
 */
export class AssignEvaluatorsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  userIds: string[];
}
