import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export const adminUserProgramValues = ['UG', 'PG'] as const;
export const adminAccountStatusValues = [
  'active',
  'deactive',
  'suspended',
] as const;

export type AdminUserProgramValue = (typeof adminUserProgramValues)[number];
export type AdminAccountStatusValue = (typeof adminAccountStatusValues)[number];

export class UpdateUserAdminDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsEnum(adminUserProgramValues, {
    message: 'userProgram must be UG or PG',
  })
  userProgram?: AdminUserProgramValue;

  @IsOptional()
  @IsString()
  university?: string;

  @IsOptional()
  @IsString()
  universityId?: string;

  @IsOptional()
  @IsBoolean()
  isExternal?: boolean;

  @IsOptional()
  @IsEnum(adminAccountStatusValues, {
    message: 'accountStatus must be active, deactive, or suspended',
  })
  accountStatus?: AdminAccountStatusValue;
}
