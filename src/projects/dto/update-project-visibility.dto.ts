import { IsBoolean } from 'class-validator';

export class UpdateProjectVisibilityDto {
  @IsBoolean()
  isPublic: boolean;
}
