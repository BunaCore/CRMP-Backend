import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { FilesRepository } from './files.repository';
import { FileUploadResponseDto } from 'src/proposals/dto/workflow.dto';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

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
  private readonly uploadDir = path.join(process.cwd(), 'uploads');

  constructor(private filesRepository: FilesRepository) {
    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Upload file and create TEMP record.
   *
   * LIFECYCLE STEP 1: Upload
   * - No business meaning assigned
   * - No resource attachment
   * - Purely infrastructure: store file, create DB record
   *
   * @param file - uploaded file
   * @param userId - user uploading the file
   * @returns FileUploadResponseDto with fileId
   */
  async uploadFile(
    file: UploadedFile,
    userId: string,
  ): Promise<FileUploadResponseDto> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 50MB limit');
    }

    // Generate unique filename
    const fileId = randomUUID();
    const storagePath = await this.saveToStorage(file, fileId);

    try {
      // Create DB record with NO resource binding (TEMP status only)
      const dbFile = await this.filesRepository.createFile({
        storagePath,
        uploadedBy: userId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        resourceType: null, // NOT set during upload
        resourceId: null, // NOT set during upload
        purpose: null, // NOT set during upload
        status: 'TEMP',
      });

      return {
        fileId: dbFile.id,
        name: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      };
    } catch (error) {
      // Cleanup on error
      try {
        fs.unlinkSync(storagePath);
      } catch (e) {
        // ignore cleanup errors
      }
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`File upload failed: ${errorMsg}`);
    }
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
   * Retrieve file by ID for download/viewing.
   *
   * @param fileId - UUID of the file
   * @returns file buffer and metadata
   */
  async getFileById(fileId: string): Promise<UploadedFile | null> {
    const dbFile = await this.filesRepository.findById(fileId);
    if (!dbFile) {
      return null;
    }

    // Check if file exists on disk
    if (!fs.existsSync(dbFile.storagePath)) {
      throw new NotFoundException(
        `File ${fileId} not found on disk (database record exists)`,
      );
    }

    // Read file from disk
    const buffer = fs.readFileSync(dbFile.storagePath);

    return {
      buffer,
      originalname: dbFile.originalName,
      mimetype: dbFile.mimeType,
      size: dbFile.size,
    };
  }

  /**
   * Delete file from disk and DB.
   *
   * @param fileId - UUID of the file
   */
  async deleteFile(fileId: string): Promise<void> {
    const dbFile = await this.filesRepository.findById(fileId);
    if (!dbFile) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    // Delete from disk (ignore errors)
    try {
      if (fs.existsSync(dbFile.storagePath)) {
        fs.unlinkSync(dbFile.storagePath);
      }
    } catch (error) {
      console.warn(`Failed to delete file from disk: ${fileId}`, error);
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

  /**
   * Internal helper: Save file to storage.
   *
   * FUTURE: Replace with S3/cloud storage
   * This abstraction allows swapping implementations without changing callers.
   *
   * @param file - uploaded file
   * @param fileId - UUID for the file
   * @returns storage path (local or S3 URL)
   */
  private async saveToStorage(
    file: UploadedFile,
    fileId: string,
  ): Promise<string> {
    const ext = path.extname(file.originalname);
    const filename = `${fileId}${ext}`;
    const storagePath = path.join(this.uploadDir, filename);

    // For now: local filesystem
    fs.writeFileSync(storagePath, file.buffer);

    return storagePath;

    // FUTURE: S3 implementation
    // const s3Key = `uploads/${filename}`;
    // await this.s3Client.putObject({ Bucket, Key: s3Key, Body: file.buffer });
    // return `s3://${Bucket}/${s3Key}`;
  }
}
