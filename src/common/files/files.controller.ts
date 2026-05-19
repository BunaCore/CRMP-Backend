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
import { GuestPresignDto } from './dto/guest-presign.dto';
import { RateLimit } from 'src/common/guards/rate-limit.decorator';
import { RateLimitGuard } from 'src/common/guards/rate-limit.guard';

/**
 * FilesController - Global file upload/download endpoints
 * Routes:
 * - POST /files/upload - Initiate direct upload, returns presigned URL
 * - GET /files/:id - Return access URL by file ID
 */
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * POST /files/upload
   * Initiate direct upload to object storage
   *
   * Resource Types for Public Bucket (directly accessible):
   * - USER_AVATAR: User profile avatars
   * - PROJECT_BANNER: Project banner images
   * - PROJECT_FILE: Project public files (published content)
   *
   * Other resource types or undefined → Private bucket (requires auth/signed URL)
   *
   * Returns: { fileId, uploadUrl, storageKey, publicUrl? }
   * File is stored in TEMP status until attached to a resource
   */
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  async uploadFile(
    @Body() dto: InitiateUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.filesService.initiateUpload(dto, user.id);
  }

  /**
   * Guest presign endpoint - unauthenticated.
   * Returns a TEMP file record and a short-lived presigned PUT URL.
   */
  @Post('guest-presign')
  @UseGuards(RateLimitGuard)
  @RateLimit({ points: 5, windowSeconds: 60 })
  async guestPresign(@Body() dto: GuestPresignDto) {
    // Basic MIME/size checks could be added here. Captcha verification
    // should be performed by wiring a verification service.
    return this.filesService.initiateGuestUpload({
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      size: dto.size,
      resourceType: dto.resourceType,
    });
  }

  /**
   * GET /files/:id
   * Return signed URL for private files or direct URL for public files
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getFileUrl(@Param('id', new ParseUUIDPipe()) fileId: string) {
    const fileData = await this.filesService.getFileById(fileId);
    if (!fileData) {
      throw new BadRequestException(`File ${fileId} not found`);
    }
    return fileData;
  }
}
