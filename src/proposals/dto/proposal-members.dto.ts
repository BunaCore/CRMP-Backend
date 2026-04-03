import { IsUUID, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum ProposalMemberRole {
  PI = 'PI',
  MEMBER = 'MEMBER',
  SUPERVISOR = 'SUPERVISOR',
}

export class ProposalMemberInputDto {
  @IsUUID('4')
  userId: string;

  @IsEnum(ProposalMemberRole)
  role: ProposalMemberRole;
}

export class AddProposalMembersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalMemberInputDto)
  members: ProposalMemberInputDto[];
}
