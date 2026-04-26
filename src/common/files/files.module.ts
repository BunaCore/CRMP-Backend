import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesRepository } from './files.repository';
import { FilesController } from './files.controller';
import { STORAGE_SERVICE } from './storage/storage.interface';
import { S3StorageService } from './storage/s3.storage';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    FilesRepository,
    S3StorageService,
    {
      provide: STORAGE_SERVICE,
      useExisting: S3StorageService,
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
