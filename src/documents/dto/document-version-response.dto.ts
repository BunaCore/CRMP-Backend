export class DocumentVersionResponseDto {
  id: string;
  versionNumber: number;
  createdAt: Date;
  createdBy: string; // user id
  sourceAction: string;
  contentHash: string;
}

export class DocumentVersionDetailResponseDto extends DocumentVersionResponseDto {
  content: any; // Tiptap JSON for preview
}