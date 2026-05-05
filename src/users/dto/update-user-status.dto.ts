import { IsNotEmpty, IsEnum } from 'class-validator';

export const accountStatuses = ['active', 'deactive', 'suspended'] as const;

export type AccountStatusValue = (typeof accountStatuses)[number];

export class UpdateUserStatusDto {
  @IsNotEmpty({ message: 'status is required' })
  @IsEnum(accountStatuses, {
    message: 'status must be one of: active, deactive, suspended',
  })
  status: AccountStatusValue;
}
