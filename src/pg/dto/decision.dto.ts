import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export enum PgDecisionAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REVISION_REQUIRED = 'REVISION_REQUIRED',
}

export class PgDecisionDto {
  @IsEnum(PgDecisionAction, {
    message: 'decision must be one of: APPROVE, REJECT, REVISION_REQUIRED',
  })
  @IsNotEmpty()
  decision: PgDecisionAction;

  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'Comment cannot exceed 1000 characters' })
  comment?: string;

  @IsUUID('4', { message: 'attachmentFileId must be a valid UUID' })
  @IsOptional()
  attachmentFileId?: string;
}
