import {
  Controller,
  Post,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { FilesService } from './files.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from 'src/auth/decorators/current-user.decorator';

/**
 * FilesController - Global file upload/download endpoints
 * Routes:
 * - POST /files/upload - Upload file, returns fileId
 * - GET /files/:id - Stream/download file by ID
 */
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * POST /files/upload
   * Upload a file for use in proposals, forms, attachments
   * Returns: { fileId, name, mimeType, size }
   * File is stored in TEMP status until attached to a resource
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
        ],
      }),
    )
    file: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.filesService.uploadFile(file, user.id);
  }

  /**
   * GET /files/:id
   * Download/stream file by ID
   * Streams file content with proper headers
   */
  @Get(':id')
  async downloadFile(
    @Param('id', new ParseUUIDPipe()) fileId: string,
    @Res() res: Response,
  ) {
    const fileData = await this.filesService.getFileById(fileId);
    if (!fileData) {
      throw new BadRequestException(`File ${fileId} not found`);
    }

    // Set response headers
    res.set({
      'Content-Type': fileData.mimetype || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileData.originalname}"`,
    });

    // Send file buffer
    res.send(fileData.buffer);
  }
}
