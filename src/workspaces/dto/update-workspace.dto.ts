import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
