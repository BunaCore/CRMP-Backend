import { IsString, IsDateString } from 'class-validator';

export class DefenseEmailDto {
  @IsString()
  recipientName: string;

  @IsDateString()
  defenseDate: string;

  @IsString()
  defenseTime: string;

  @IsString()
  proposalTitle: string;
}