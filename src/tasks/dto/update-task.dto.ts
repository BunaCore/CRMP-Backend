import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { TaskPriority, TaskStatus } from './create-task.dto';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsUUID('4')
  assigneeId?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}
