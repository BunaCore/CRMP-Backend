import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { files, type File, type CreateFileInput } from 'src/db/schema/files';

@Injectable()
export class FilesRepository {
  constructor(private drizzle: DrizzleService) {}

  /**
   * Create a new file record
   */
  async createFile(input: CreateFileInput): Promise<File> {
    const [file] = await this.drizzle.db
      .insert(files)
      .values(input)
      .returning();
    return file;
  }

  /**
   * Fetch file by ID
   */
  async findById(fileId: string): Promise<File | null> {
    const file = await this.drizzle.db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);
    return file[0] || null;
  }

  /**
   * Update file status
   */
  async updateStatus(
    fileId: string,
    status: 'TEMP' | 'ATTACHED',
  ): Promise<void> {
    await this.drizzle.db
      .update(files)
      .set({ status })
      .where(eq(files.id, fileId));
  }

  /**
   * Attach file to a resource (proposal, step, etc)
   */
  async attachToResource(
    fileId: string,
    resourceType: string,
    resourceId: string,
    purpose?: string | null,
  ): Promise<void> {
    await this.drizzle.db
      .update(files)
      .set({
        resourceType,
        resourceId,
        purpose: purpose || null,
        status: 'ATTACHED',
      })
      .where(eq(files.id, fileId));
  }

  /**
   * Delete file record (cleanup)
   */
  async delete(fileId: string): Promise<boolean> {
    const result = await this.drizzle.db
      .delete(files)
      .where(eq(files.id, fileId));
    return !!result.rowCount;
  }

  /**
   * Get all TEMP files older than X minutes
   */
  async getTempFilesOlderThan(minutes: number): Promise<File[]> {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    const allTemp = await this.drizzle.db
      .select()
      .from(files)
      .where(eq(files.status, 'TEMP'));

    // Filter in JS to handle date comparison
    return allTemp.filter((f) => f.createdAt && f.createdAt < cutoffTime);
  }
}
