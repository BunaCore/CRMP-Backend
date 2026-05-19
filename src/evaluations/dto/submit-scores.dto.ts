import {
  IsUUID,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScoreDto {
  @IsUUID()
  rubricId: string;

  @IsUUID()
  studentId: string;

  @IsNumber()
  score: number;

  @IsString()
  @IsOptional()
  feedback?: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;
}

export class SubmitScoresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreDto)
  scores: ScoreDto[];
}
