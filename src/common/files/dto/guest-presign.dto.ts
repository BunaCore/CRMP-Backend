import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class GuestPresignDto {
  @IsString()
  @IsNotEmpty()
  originalName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  size: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  resourceType?: string;

  // Captcha token from client (optional for now, wire verification later)
  @IsString()
  @IsOptional()
  captchaToken?: string;
}
