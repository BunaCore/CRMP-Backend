import { IsString } from 'class-validator';

export class ProposalStatusEmailDto {
  @IsString()
  recipientName: string;

  @IsString()
  proposalTitle: string;

  @IsString()
  status: string;
}