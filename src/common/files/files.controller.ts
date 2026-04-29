import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from 'src/auth/decorators/current-user.decorator';
import { InitiateUploadDto } from './dto/initiate-upload.dto';

/**
 * FilesController - Global file upload/download endpoints
 * Routes:
 * - POST /files/upload - Initiate direct upload, returns presigned URL
 * - GET /files/:id - Return access URL by file ID
 */
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * POST /files/upload
   * Initiate direct upload to object storage
   * Returns: { fileId, uploadUrl, storageKey, publicUrl? }
   * File is stored in TEMP status until attached to a resource
   */
  @Post('upload')
  async uploadFile(
    @Body() dto: InitiateUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.filesService.initiateUpload(dto, user.id);
  }

  /**
   * GET /files/:id
   * Return signed URL for private files or direct URL for public files
   */
  @Get(':id')
  async getFileUrl(
    @Param('id', new ParseUUIDPipe()) fileId: string,
  ) {
    const fileData = await this.filesService.getFileById(fileId);
    if (!fileData) {
      throw new BadRequestException(`File ${fileId} not found`);
    }
    return fileData;
  }
}
