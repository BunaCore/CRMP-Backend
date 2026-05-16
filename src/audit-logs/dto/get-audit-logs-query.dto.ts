import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { AuditAction, type AuditActionValue } from '../types/audit-action.enum';

@ValidatorConstraint({ name: 'isValidCursor', async: false })
class IsValidCursorConstraint implements ValidatorConstraintInterface {
  validate(value: any) {
    if (!value) return true; // Optional field
    if (typeof value !== 'string') return false;

    try {
      const decoded = JSON.parse(
        Buffer.from(value, 'base64').toString('utf-8'),
      );
      // Must contain createdAt and id
      return (
        typeof decoded.createdAt === 'string' &&
        typeof decoded.id === 'string' &&
        !isNaN(Date.parse(decoded.createdAt))
      );
    } catch {
      return false;
    }
  }

  defaultMessage() {
    return 'cursor must be valid base64-encoded JSON with { createdAt: ISO8601, id: UUID }';
  }
}

export class GetAuditLogsQueryDto {
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

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number; // optional, defaults to 20

  @IsOptional()
  @IsString()
  @Validate(IsValidCursorConstraint)
  cursor?: string; // base64-encoded { createdAt, id } from previous response.next
}
