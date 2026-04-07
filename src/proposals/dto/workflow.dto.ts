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
 * Unified request DTO for step actions (vote, submit form, etc.)
 * Used by POST /proposals/:id/action endpoint
 */
export class SubmitStepActionDto {
  @IsEnum(['VOTE', 'SUBMIT'])
  action: 'VOTE' | 'SUBMIT';

  @IsString()
  @IsOptional()
  comment?: string;

  @IsEnum(['Accepted', 'Rejected', 'Needs_Revision'])
  @IsOptional()
  decision?: 'Accepted' | 'Rejected' | 'Needs_Revision'; // For VOTE steps

  @IsObject()
  @IsOptional()
  submittedData?: Record<string, any>; // For FORM steps (field values + fileIds)
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
