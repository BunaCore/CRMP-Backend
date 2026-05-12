import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ApproveDisbursementDto {
  @IsString()
  @IsNotEmpty({ message: 'Bank transaction reference ID is required.' })
  @MinLength(5, { message: 'Transaction ID must be at least 5 characters.' })
  bankTransactionId: string;
}
