import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesRepository } from './files.repository';

@Module({
  providers: [FilesService, FilesRepository],
  exports: [FilesService],
})
export class FilesModule {}
