import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * InitiateUploadDto - Request to initiate a file upload
 *
 * Resource Types:
 * - USER_AVATAR: User profile avatar (public bucket)
 * - PROJECT_BANNER: Project banner image (public bucket)
 * - PROJECT_FILE: Project public file (public bucket)
 * - (undefined/other): Stored in private bucket (requires auth to access)
 */
export class InitiateUploadDto {
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
}
