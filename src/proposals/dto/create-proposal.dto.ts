import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsUUID,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum ProposalType {
  Undergraduate = 'Undergraduate',
  Postgraduate = 'Postgraduate',
  Funded_Project = 'Funded_Project',
  Unfunded_Project = 'Unfunded_Project',
}

export enum DegreeLevel {
  Master = 'Master',
  PhD = 'PhD',
  NA = 'NA',
}

export class BudgetItemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;
}

export class CreateProposalDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  abstract?: string;

  @IsEnum(ProposalType)
  @IsNotEmpty()
  proposalType: ProposalType;

  @IsEnum(DegreeLevel)
  @IsOptional()
  degreeLevel?: DegreeLevel = DegreeLevel.NA;

  @IsString()
  @IsNotEmpty()
  researchArea: string;

  @IsUUID()
  @IsOptional()
  advisorUserId?: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  durationMonths: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetItemDto)
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  budget: BudgetItemDto[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  collaborators?: string[];
}
