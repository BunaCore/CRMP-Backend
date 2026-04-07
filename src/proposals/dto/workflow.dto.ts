import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsObject,
} from 'class-validator';

/**
 * Unified request DTO for step actions (approve, reject, vote, submit form)
 */
export class SubmitStepActionDto {
  @IsEnum(['APPROVE', 'REJECT', 'REQUEST_REVIEW', 'VOTE', 'SUBMIT'])
  action: 'APPROVE' | 'REJECT' | 'REQUEST_REVIEW' | 'VOTE' | 'SUBMIT';

  @IsString()
  @IsOptional()
  comment?: string;

  @IsString()
  @IsEnum(['APPROVE', 'REJECT'])
  @IsOptional()
  decision?: 'APPROVE' | 'REJECT'; // For VOTE steps only

  @IsObject()
  @IsOptional()
  submittedData?: Record<string, any>; // For INPUT steps only
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
