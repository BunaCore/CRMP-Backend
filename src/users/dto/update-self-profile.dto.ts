import { IsOptional, IsString } from 'class-validator';

export class UpdateSelfProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
