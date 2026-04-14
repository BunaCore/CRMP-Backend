import { IsString } from 'class-validator';

export class ImportMarkdownDto {
  @IsString()
  markdown: string;
}