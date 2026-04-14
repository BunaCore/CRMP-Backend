import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsRepository } from './documents.repository';
import { TiptapValidator } from './tiptap-validator.service';
import { TiptapRenderer } from './tiptap-renderer.service';
import { MarkdownConverter } from './markdown-converter.service';
import { DbModule } from 'src/db/db.module';
import { AccessControlModule } from 'src/access-control/access-control.module';

@Module({
  imports: [DbModule, AccessControlModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository, TiptapValidator, TiptapRenderer, MarkdownConverter],
  exports: [DocumentsService, TiptapValidator],
})
export class DocumentsModule {}