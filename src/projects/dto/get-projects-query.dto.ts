import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export type ProjectRole =
  | 'PI'
  | 'MEMBER'
  | 'SUPERVISOR'
  | 'EVALUATOR'
  | 'ADVISOR';

/**
 * Query DTO for GET /projects/all endpoint
 * Supports filtering, searching, and pagination (matches proposal pattern)
 */
export class GetProjectsQueryDto {
  /**
   * Fetch only projects created by or associated with the current user
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  me?: boolean;

  /**
   * Comma-separated roles to filter by (e.g., "PI,MEMBER")
   * Filters project_members.role
   */
  @IsOptional()
  @IsString()
  roles?: string;

  /**
   * Filter by project stage
   */
  @IsOptional()
  @IsString()
  stage?: string;

  /**
   * Filter by project program
   */
  @IsOptional()
  @IsString()
  program?: string;

  /**
   * Filter by department ID
   */
  @IsOptional()
  @IsString()
  departmentId?: string;

  /**
   * Full-text search on project title
   * Uses ILIKE for case-insensitive matching
   */
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Pagination page number (1-indexed)
   * Default: 1
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => (value ? parseInt(value, 10) : 1))
  page?: number = 1;

  /**
   * Items per page
   * Default: 10, Max: 50
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  @Transform(({ value }) => {
    const limit = value ? parseInt(value, 10) : 10;
    return Math.min(limit, 50);
  })
  limit?: number = 10;
}
