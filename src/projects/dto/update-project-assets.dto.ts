import { IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';

export class UpdateProjectAssetsDto {
  @IsOptional()
  @IsUUID()
  publicFileId?: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  publicFileUrl?: string;

  @IsOptional()
  @IsUUID()
  bannerFileId?: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  bannerUrl?: string;
}
