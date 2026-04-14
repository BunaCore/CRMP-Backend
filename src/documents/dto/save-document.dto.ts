import { IsObject, IsOptional, IsNumber } from 'class-validator';

export class SaveDocumentDto {
  @IsObject()
  content: any; // Tiptap JSON

  @IsOptional()
  @IsNumber()
  expectedVersion?: number;
}