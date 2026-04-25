import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReplaceRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}
