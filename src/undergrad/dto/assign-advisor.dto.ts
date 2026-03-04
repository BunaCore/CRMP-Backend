import { IsUUID, IsOptional, IsDateString } from 'class-validator';

/**
 * AssignAdvisorDto
 *
 * Body sent by the coordinator when selecting an advisor for a UG proposal.
 *
 * Fields:
 *   advisorUserId — required UUID of the user to assign (must have ADVISOR role)
 *   dueDate       — optional ISO date string for the advisor's review deadline
 */
export class AssignAdvisorDto {
    @IsUUID('4', { message: 'advisorUserId must be a valid UUID' })
    advisorUserId: string;

    @IsDateString({}, { message: 'dueDate must be a valid ISO date string (e.g. 2026-04-15)' })
    @IsOptional()
    dueDate?: string;
}
