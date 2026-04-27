export class FileAccessResponseDto {
  fileId: string;
  url: string;
  visibility: 'public' | 'private';
  expiresIn?: number;
}
