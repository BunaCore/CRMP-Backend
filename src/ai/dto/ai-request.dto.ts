import { IsString, IsOptional, IsArray, IsEnum, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MessageHistoryDto {
  @IsString()
  role: string;

  @IsString()
  content: string;
}

export class AiRequestDto {
  @IsString()
  requestType: string;

  @IsString()
  @IsOptional()
  message?: string;

  @IsOptional()
  @IsString()
  context?: string;

  @IsEnum(['local', 'cloud'])
  aiMode: 'local' | 'cloud';

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  workspaceName?: string;

  @IsOptional()
  @IsString()
  userRole?: string;

  @IsOptional()
  @IsNumber()
  from?: number;

  @IsOptional()
  @IsNumber()
  to?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageHistoryDto)
  history?: MessageHistoryDto[];
}
