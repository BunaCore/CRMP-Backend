import {
  IsUUID,
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsISO8601,
  IsBoolean,
} from 'class-validator';

/**
 * Lean proposal info with current step metadata
 * Used for both /my and /pending-approvals endpoints
 */
export class ProposalListItemDto {
  @IsUUID()
  id: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  abstract?: string;

  @IsEnum(['UG', 'PG', 'GENERAL'])
  proposalProgram: string | null;

  @IsBoolean()
  @IsOptional()
  isFunded?: boolean;

  @IsEnum(['Draft', 'Under_Review', 'Needs_Revision', 'Approved', 'Rejected'])
  currentStatus: string;

  @IsISO8601()
  @IsOptional()
  submittedAt?: string;

  @IsISO8601()
  createdAt: string;

  @IsUUID()
  createdBy: string;

  @IsString()
  createdByName?: string;
}

/**
 * Extended proposal info for pending approvals
 * Includes workflow context needed for reviewers
 */
export class PendingApprovalDto extends ProposalListItemDto {
  @IsNumber()
  currentStepOrder: number;

  @IsString()
  currentApproverRole: string;

  @IsString()
  @IsOptional()
  stepLabel?: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  departmentName?: string;
}
