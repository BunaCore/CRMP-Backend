import { IsString, IsOptional, IsUrl } from 'class-validator';

export class PublishProjectDto {
  @IsString()
  @IsUrl()
  publicFileUrl: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  bannerUrl?: string;
}
