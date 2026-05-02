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
 * Proposal representation for list endpoints
 * Supports both /my and /pending-approvals with optional workflow fields
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

  @IsBoolean()
  @IsOptional()
  isEditable?: boolean;

  @IsISO8601()
  @IsOptional()
  submittedAt?: string;

  @IsISO8601()
  createdAt: string;

  @IsUUID()
  createdBy: string;

  @IsString()
  @IsOptional()
  createdByName?: string;

  @IsBoolean()
  @IsOptional()
  evaluatorAssigned?: boolean;

  @IsBoolean()
  @IsOptional()
  advisorAssigned?: boolean;

  // Workflow context (for pending approvals)
  @IsNumber()
  @IsOptional()
  currentStepOrder?: number;

  @IsString()
  @IsOptional()
  currentApproverRole?: string;

  @IsString()
  @IsOptional()
  stepLabel?: string;

  // User context
  @IsString()
  @IsOptional()
  userRole?: string;

  // Project context
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  departmentName?: string;
}

/**
 * Extended pending approval DTO (inherits from ProposalListItemDto)
 * Used for /pending-approvals endpoint
 */
export class PendingApprovalDto extends ProposalListItemDto {}
