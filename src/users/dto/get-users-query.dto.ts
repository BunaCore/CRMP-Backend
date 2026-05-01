import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/dto/pagination-query.dto';

type UserSortBy = 'fullName' | 'email' | 'createdAt' | 'accountStatus';
type SortDir = 'asc' | 'desc';
type AccountStatus = 'active' | 'deactive' | 'suspended';

export class GetUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @IsUUID('4')
  roleId?: string;

  @IsOptional()
  @IsString()
  roleName?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsEnum(['active', 'deactive', 'suspended'])
  accountStatus?: AccountStatus;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isExternal?: boolean;

  @IsOptional()
  @IsEnum(['fullName', 'email', 'createdAt', 'accountStatus'])
  sortBy?: UserSortBy = 'createdAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortDir?: SortDir = 'desc';
}
