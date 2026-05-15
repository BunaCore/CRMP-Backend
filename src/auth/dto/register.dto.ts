import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsNotEmpty,
  IsUUID,
  IsEnum,
  IsBoolean,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsNotEmpty({ message: 'Department ID is required' })
  @IsUUID('4', { message: 'Department ID must be a valid UUID' })
  departmentId: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  university?: string;

  @IsOptional()
  @IsString()
  universityId?: string;

  @IsNotEmpty({ message: 'userProgram is required for student registration' })
  @IsEnum(['UG', 'PG'], { message: 'userProgram must be UG or PG' })
  userProgram: 'UG' | 'PG';

  @IsOptional()
  @IsBoolean({ message: 'isExternal must be a boolean' })
  isExternal?: boolean;

  @ValidateIf((o) => o.isExternal === true)
  @IsNotEmpty({
    message:
      'supportingDocumentFileId is required when registering an external user',
  })
  @IsUUID('4', {
    message: 'supportingDocumentFileId must be a valid UUID',
  })
  supportingDocumentFileId?: string;
}
