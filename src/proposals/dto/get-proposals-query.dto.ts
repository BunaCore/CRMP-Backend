import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Type alias for proposal member roles
export type ProposalRole =
  | 'PI'
  | 'MEMBER'
  | 'SUPERVISOR'
  | 'ADVISOR'
  | 'EVALUATOR';

/**
 * Query DTO for GET /proposals endpoint
 * Supports filtering, searching, and pagination
 */
export class GetProposalsQueryDto {
  /**
   * Fetch only proposals created by or associated with the current user
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
   * Comma-separated roles to filter by (e.g., "PI,ADVISOR")
   * Filters proposal_members.role
   */
  @IsOptional()
  @IsString()
  roles?: string;

  /**
   * Filter by proposal status (e.g., "Draft", "Under_Review", "Approved")
   */
  @IsOptional()
  @IsString()
  status?: string;

  /**
   * Filter by proposal program
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
   * Full-text search on proposal title
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
  @Transform(({ value }) => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 1 : parsed;
  })
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
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 10 : Math.min(parsed, 50);
  })
  limit?: number = 10;

  /**
   * Parse roles string into array of ProposalRole
   * Called after validation for convenience
   */
  getRolesArray(): ProposalRole[] {
    if (!this.roles) {
      return [];
    }
    return this.roles
      .split(',')
      .map((r) => r.trim().toUpperCase() as ProposalRole)
      .filter((r) =>
        ['PI', 'MEMBER', 'SUPERVISOR', 'ADVISOR', 'EVALUATOR'].includes(r),
      );
  }

  /**
   * Calculate offset for pagination
   */
  getOffset(): number {
    const pageNum = this.page ?? 1;
    const limitNum = this.limit ?? 10;
    return (pageNum - 1) * limitNum;
  }
}
