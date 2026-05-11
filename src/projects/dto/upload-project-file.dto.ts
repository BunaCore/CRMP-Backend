/**
 * DTO for uploading project files (banner or public file)
 * Files are uploaded as multipart/form-data
 * Server handles the upload to public bucket and file attachment
 */
export class UploadProjectFileDto {
  // This is populated by @UseInterceptors decorator
  file?: Express.Multer.File;
}
