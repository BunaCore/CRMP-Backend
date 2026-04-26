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
  IsBoolean,
} from 'class-validator';
import { Type, Transform, plainToInstance } from 'class-transformer';
import { ProposalMemberDto } from './proposal-member.dto';

export enum ProposalProgram {
  UG = 'UG',
  PG = 'PG',
  GENERAL = 'GENERAL',
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
  @IsUUID()
  @IsNotEmpty({
    message: 'fileId is required (upload via /files/upload first)',
  })
  fileId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  abstract?: string;

  @IsEnum(ProposalProgram)
  @IsNotEmpty()
  proposalProgram: ProposalProgram;

  @IsBoolean()
  @IsOptional()
  isFunded?: boolean = false;

  @IsEnum(DegreeLevel)
  @IsOptional()
  degreeLevel?: DegreeLevel = DegreeLevel.NA;

  @IsString()
  @IsNotEmpty()
  researchArea: string;

  @IsUUID()
  @IsOptional()
  advisorUserId?: string;

  @IsUUID()
  @IsNotEmpty({ message: 'departmentId is required for proposals' })
  departmentId?: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  durationMonths: number;

  @Transform(({ value }) =>
    plainToInstance(
      BudgetItemDto,
      typeof value === 'string' ? JSON.parse(value) : value,
    ),
  )
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetItemDto)
  @IsNotEmpty()
  budget: BudgetItemDto[];

  @Transform(({ value }) =>
    plainToInstance(
      ProposalMemberDto,
      typeof value === 'string' ? JSON.parse(value) : value,
    ),
  )
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalMemberDto)
  @IsNotEmpty({ message: 'At least one member (PI) is required' })
  members: ProposalMemberDto[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  collaborators?: string[];
}
