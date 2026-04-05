import { IsUUID, IsEnum, IsNotEmpty } from 'class-validator';

export enum ProposalMemberRole {
  PI = 'PI',
  MEMBER = 'MEMBER',
  SUPERVISOR = 'SUPERVISOR',
  ADVISOR = 'ADVISOR',
  EVALUATOR = 'EVALUATOR',
}

export class ProposalMemberDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsEnum(ProposalMemberRole)
  @IsNotEmpty()
  role: ProposalMemberRole;
}
