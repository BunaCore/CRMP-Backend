import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class CreateDisbursementDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'You must select at least one budget item.' })
  @IsUUID('4', { each: true })
  budgetItemIds: string[];
  // Note: clearance document is handled separately as a Multer file upload
}
