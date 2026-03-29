import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  Min,
  ValidateNested,
  IsArray,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BudgetItemDto {
  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  requestedAmount: number;
}

export class SubmitFundedDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  abstract: string;

  @IsOptional()
  @IsString()
  researchArea?: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  durationMonths: number;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetItemDto)
  budgetItems: BudgetItemDto[];

  // File uploads (proposal file, ethics clearance, etc.) will be handled separately via interceptors.
}
