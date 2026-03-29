import { IsString, IsOptional, IsUUID } from 'class-validator';

/**
 * Request DTO for approval actions (approve, reject, request-revision)
 */
export class ApprovalActionDto {
  @IsString()
  @IsOptional()
  note?: string;
}

/**
 * Response DTO for workflow actions
 */
export class WorkflowActionResponseDto {
  success: boolean;
  message: string;
  proposalId: string;
  newStatus: string;
  nextStep?: number;
  isComplete?: boolean;
}
