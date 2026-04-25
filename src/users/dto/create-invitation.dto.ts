import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail({}, { message: 'Email must be valid' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsUUID('4', { message: 'Role ID must be a valid UUID' })
  roleId: string;

  @IsOptional()
  @IsInt({ message: 'ExpiresInHours must be an integer' })
  @Min(1, { message: 'ExpiresInHours must be at least 1 hour' })
  @Max(168, { message: 'ExpiresInHours must be 168 hours or less' })
  expiresInHours?: number;
}
