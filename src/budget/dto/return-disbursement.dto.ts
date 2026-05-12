import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ReturnDisbursementDto {
  @IsString()
  @IsNotEmpty({ message: 'Feedback is required when returning a request.' })
  @MinLength(20, { message: 'Feedback must be at least 20 characters.' })
  feedback: string;
}
