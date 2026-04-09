import { IsUUID, IsNumber, IsOptional, IsString, Min, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class EvaluationScoreItemDto {
  @IsUUID()
  rubricId: string;

  @IsUUID()
  studentId: string;

  @IsNumber()
  @Min(0)
  score: number;

  @IsString()
  @IsOptional()
  feedback?: string;

  @IsUUID()
  @IsOptional()
  projectId?: string; // Optional: provided when doing final evaluations in project phase
}

export class SubmitEvaluationScoresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreItemDto)
  scores: EvaluationScoreItemDto[];
}
