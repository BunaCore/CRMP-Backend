import { IsString, IsOptional, IsUUID, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Update DTO for proposal edits after rejection/revision request
 * Only allows non-critical fields to change
 *
 * Immutable fields (cannot be changed after creation):
 * - proposalProgram (determines workflow routing)
 * - departmentId (determines workflow routing)
 * - budget (determines workflow cost and approval flow)
 */
export class UpdateProposalDto {
  @IsUUID()
  @IsOptional()
  fileId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  abstract?: string;

  @IsString()
  @IsOptional()
  researchArea?: string;
}
