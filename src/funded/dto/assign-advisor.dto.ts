import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignAdvisorDto {
  @IsNotEmpty()
  @IsUUID()
  advisorId: string;
}
