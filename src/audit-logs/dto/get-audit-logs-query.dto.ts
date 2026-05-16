import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/dto/pagination-query.dto';
import { AuditAction, type AuditActionValue } from '../types/audit-action.enum';

export class GetAuditLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  actorUserId?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsUUID('4')
  entityId?: string;

  @IsOptional()
  @IsIn(Object.values(AuditAction))
  action?: AuditActionValue;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  to?: Date;
}
