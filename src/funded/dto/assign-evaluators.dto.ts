import { IsArray, IsNotEmpty, IsUUID } from 'class-validator';

export class AssignEvaluatorsDto {
    @IsArray()
    @IsNotEmpty()
    @IsUUID('4', { each: true })
    evaluatorIds: string[];
}
