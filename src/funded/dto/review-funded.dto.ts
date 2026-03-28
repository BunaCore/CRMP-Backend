import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class ReviewFundedDto {
  @IsNotEmpty()
  @IsIn(['Accepted', 'Rejected', 'Needs_Revision'])
  decision: 'Accepted' | 'Rejected' | 'Needs_Revision';

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsUUID()
  attachmentFileId?: string;

  // For the FINANCE role to approve the specific budget amount
  @IsOptional()
  @IsNumber()
  @Min(0)
  approvedAmount?: number;
}
