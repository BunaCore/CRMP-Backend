import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FilesRepository } from './files.repository';
import { ConfigService } from '@nestjs/config';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { FileUploadInitResponseDto } from './dto/file-upload-init-response.dto';
import { FileAccessResponseDto } from './dto/file-access-response.dto';
import {
  STORAGE_SERVICE,
  type StorageService,
} from './storage/storage.interface';

/**
 * FilesService is a generic, workflow-agnostic file management service.
 *
 * Responsibilities:
 * - Upload files → create TEMP records (no business meaning)
 * - Store files to disk (abstracted for future S3 migration)
 * - Retrieve files by ID
 * - Attach files to resources (via attachFile)
 * - Cleanup old TEMP files
 *
 * NOT responsible for:
 * - Workflow logic
 * - Access control
 * - Proposal-specific behavior
 */
@Injectable()
export class FilesService {
  private readonly publicBucket: string;
  private readonly privateBucket: string;
  private readonly publicBaseUrl: string;
  private readonly signedUrlExpiresSeconds: number;

  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) {
    this.publicBucket =
      this.configService.get<string>('S3_BUCKET_PUBLIC') || 'crmp-public';
    this.privateBucket =
      this.configService.get<string>('S3_BUCKET_PRIVATE') || 'crmp-private';
    this.publicBaseUrl =
      this.configService.get<string>('S3_PUBLIC_BASE_URL') || '';
    this.signedUrlExpiresSeconds = parseInt(
      this.configService.get<string>('S3_SIGNED_URL_EXPIRES_SECONDS') || '900',
      10,
    );
  }

  /**
   * Create presigned upload URL and TEMP file record.
   *
   * LIFECYCLE STEP 1: Upload
   * - No business meaning assigned
   * - No resource attachment
   * - Purely infrastructure: store file, create DB record
   *
   * @param dto - upload metadata from client
   * @param userId - user initiating upload
   */
  async initiateUpload(
    dto: InitiateUploadDto,
    userId: string,
  ): Promise<FileUploadInitResponseDto> {
    const fileId = randomUUID();
    const key = this.buildStorageKey(userId, fileId, dto.originalName);
    const { bucket, isPublic } = this.resolveBucket(dto.resourceType);

    const dbFile = await this.filesRepository.createFile({
      bucket,
      storagePath: key,
      uploadedBy: userId,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      size: dto.size,
      resourceType: dto.resourceType || null,
      resourceId: null,
      purpose: null,
      status: 'TEMP',
    });

    const uploadUrl = await this.storageService.getPresignedPutUrl({
      bucket,
      key,
      contentType: dto.mimeType,
      expiresInSeconds: this.signedUrlExpiresSeconds,
    });

    return {
      fileId: dbFile.id,
      storageKey: key,
      uploadUrl,
      publicUrl: isPublic ? this.buildPublicUrl(key) : undefined,
    };
  }

  /**
   * Attach file to a resource.
   *
   * LIFECYCLE STEP 2: Attach
   * - Only files in TEMP status can be attached
   * - Assigns business meaning: resourceType, resourceId, purpose
   * - Changes status to ATTACHED
   *
   * Called by: workflow/action layer when finalizing submissions
   *
   * @param fileId - ID of the TEMP file
   * @param resourceType - e.g., 'PROPOSAL', 'STEP'
   * @param resourceId - UUID of the proposal or step
   * @param purpose - contextual purpose (e.g., 'FORM_FIELD', 'APPROVAL_ATTACHMENT')
   */
  async attachFile(
    fileId: string,
    resourceType: string,
    resourceId: string,
    purpose?: string,
  ): Promise<void> {
    const dbFile = await this.filesRepository.findById(fileId);
    if (!dbFile) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    // Ensure file is in TEMP state
    if (dbFile.status !== 'TEMP') {
      throw new BadRequestException(
        `Cannot attach file in ${dbFile.status} state. Only TEMP files can be attached.`,
      );
    }

    // Attach and change status to ATTACHED
    await this.filesRepository.attachToResource(
      fileId,
      resourceType,
      resourceId,
      purpose || null,
    );
  }

  /**
   * Resolve file access URL by file ID.
   */
  async getFileById(fileId: string): Promise<FileAccessResponseDto | null> {
    const dbFile = await this.filesRepository.findById(fileId);
    if (!dbFile) {
      return null;
    }

    if (!dbFile.bucket) {
      throw new BadRequestException(`File ${fileId} has no storage bucket`);
    }

    if (dbFile.bucket === this.publicBucket) {
      return {
        fileId: dbFile.id,
        url: this.buildPublicUrl(dbFile.storagePath),
        visibility: 'public',
      };
    }

    const url = await this.storageService.getPresignedGetUrl({
      bucket: dbFile.bucket,
      key: dbFile.storagePath,
      expiresInSeconds: this.signedUrlExpiresSeconds,
    });

    return {
      fileId: dbFile.id,
      url,
      visibility: 'private',
      expiresIn: this.signedUrlExpiresSeconds,
    };
  }

  async getFileWithAccess(fileId: string): Promise<{
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    visibility: 'public' | 'private';
    expiresIn?: number;
  } | null> {
    const meta = await this.filesRepository.findById(fileId);
    if (!meta) {
      return null;
    }

    const access = await this.getFileById(fileId);
    if (!access) {
      return null;
    }

    return {
      id: meta.id,
      originalName: meta.originalName,
      mimeType: meta.mimeType,
      size: meta.size,
      url: access.url,
      visibility: access.visibility,
      expiresIn: access.expiresIn,
    };
  }

  /**
   * Delete file from storage and DB.
   *
   * @param fileId - UUID of the file
   */
  async deleteFile(fileId: string): Promise<void> {
    const dbFile = await this.filesRepository.findById(fileId);
    if (!dbFile) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    if (!dbFile.bucket) {
      throw new BadRequestException(`File ${fileId} has no storage bucket`);
    }

    // Delete from object storage (ignore errors)
    try {
      await this.storageService.deleteObject(dbFile.bucket, dbFile.storagePath);
    } catch (error) {
      console.warn(`Failed to delete file from storage: ${fileId}`, error);
    }

    // Delete from DB
    await this.filesRepository.delete(fileId);
  }

  /**
   * Cleanup TEMP files older than 1 hour.
   *
   * Scheduled job to prevent disk bloat from abandoned uploads.
   * Only deletes TEMP files (never attached files).
   *
   * @returns count of files deleted
   */
  async cleanupOldTempFiles(): Promise<number> {
    const tempFiles = await this.filesRepository.getTempFilesOlderThan(60);
    let deleted = 0;

    for (const file of tempFiles) {
      try {
        await this.deleteFile(file.id);
        deleted++;
      } catch (error) {
        console.error(`Failed to cleanup file ${file.id}:`, error);
      }
    }

    return deleted;
  }

  private buildStorageKey(
    userId: string,
    fileId: string,
    originalName: string,
  ): string {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `uploads/${userId}/${fileId}/${safeName}`;
  }

  private resolveBucket(resourceType?: string): {
    bucket: string;
    isPublic: boolean;
  } {
    if (resourceType === 'USER_AVATAR') {
      return {
        bucket: this.publicBucket,
        isPublic: true,
      };
    }

    return {
      bucket: this.privateBucket,
      isPublic: false,
    };
  }

  private buildPublicUrl(storageKey: string): string {
    if (!this.publicBaseUrl) {
      throw new BadRequestException(
        'S3_PUBLIC_BASE_URL is required to serve public file URLs',
      );
    }

    const base = this.publicBaseUrl.endsWith('/')
      ? this.publicBaseUrl.slice(0, -1)
      : this.publicBaseUrl;
    const key = storageKey.startsWith('/') ? storageKey.slice(1) : storageKey;
    return `${base}/${key}`;
  }
}
