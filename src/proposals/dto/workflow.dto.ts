import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsObject,
} from 'class-validator';

/**
 * Request DTO for existing approval actions (approve, reject, request-revision)
 */
export class ApprovalActionDto {
  @IsString()
  @IsOptional()
  note?: string;
}

/**
 * Unified request DTO for step actions (APPROVAL, VOTE, FORM)
 * Behavior determined by stepType, not by action field
 * Used by POST /proposals/:id/action endpoint
 */
export class SubmitStepActionDto {
  @IsEnum(['Accepted', 'Rejected', 'Needs_Revision'])
  @IsOptional()
  decision?: 'Accepted' | 'Rejected' | 'Needs_Revision';

  @IsObject()
  @IsOptional()
  input?: Record<string, any>; // For FORM: field values + fileIds

  @IsString()
  @IsOptional()
  comment?: string;
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

/**
 * File upload response
 */
export class FileUploadResponseDto {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
}
