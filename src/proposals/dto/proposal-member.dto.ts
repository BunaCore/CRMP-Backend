import { IsUUID, IsEnum, IsNotEmpty } from 'class-validator';

export enum ProposalMemberRole {
  PI = 'PI',
  MEMBER = 'MEMBER',
  SUPERVISOR = 'SUPERVISOR',
}

export class ProposalMemberDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsEnum(ProposalMemberRole)
  @IsNotEmpty()
  role: ProposalMemberRole;
}
