import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Shared DTO for scheduling a defence.
 * Used for both:
 *   POST /proposals/:id/defence   → proposal phase defence
 *   POST /projects/:id/defence    → project phase defence
 */
export class CreateDefenceDto {
  /**
   * ISO 8601 datetime string, e.g. "2026-06-15T09:00:00.000Z"
   */
  @IsDateString()
  defenceDate: string;

  /**
   * Physical or virtual location (e.g. "Room A201" or "Zoom - https://…")
   */
  @IsString()
  @IsNotEmpty()
  location: string;

  /**
   * Optional notes or instructions for the defence session.
   */
  @IsOptional()
  @IsString()
  note?: string;
}
