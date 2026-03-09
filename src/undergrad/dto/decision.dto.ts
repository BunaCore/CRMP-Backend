import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Valid decisions the coordinator can make on a UG proposal.
 * Mirrors the approval_decision ENUM in the database.
 */
export enum CoordinatorDecision {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  Needs_Revision = 'Needs_Revision',
}

/**
 * DecisionDto
 *
 * Body sent by the coordinator when clicking Accept / Reject / Needs Revision.
 *
 * Fields:
 *   decision       — required, one of the three valid outcomes
 *   comment        — optional free-text. Shown to the researcher alongside the
 *                    decision so they understand WHY it was approved/rejected/
 *                    sent back for changes. Stored in proposal_approvals.comment
 *                    AND as the note in proposal_status_history.
 *   attachmentFileId — optional UUID of an already-uploaded file (e.g., a
 *                      stamped coordinator review form). Must be a valid UUID
 *                      of an existing proposal_files row.
 */
export class DecisionDto {
  @IsEnum(CoordinatorDecision, {
    message: `decision must be one of: Accepted, Rejected, Needs_Revision`,
  })
  @IsNotEmpty()
  decision: CoordinatorDecision;

  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'Comment cannot exceed 1000 characters' })
  comment?: string;

  @IsUUID('4', { message: 'attachmentFileId must be a valid UUID' })
  @IsOptional()
  attachmentFileId?: string;
}
