import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersModule } from 'src/users/users.module';
import { DocumentsModule } from 'src/documents/documents.module';
import { CollaborationGateway } from './collaboration.gateway';
import { CollaborationService } from './collaboration.service';
import { CollaborationPersistenceService } from './collaboration.persistence.service';
import { CollaborationYjsRepository } from './yjs/collaboration-yjs.repository';
import { CollaborationYjsDocService } from './yjs/collaboration-yjs-doc.service';

@Module({
  imports: [
    UsersModule,
    DocumentsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    CollaborationGateway,
    CollaborationService,
    CollaborationPersistenceService,
    CollaborationYjsRepository,
    CollaborationYjsDocService,
  ],
  exports: [CollaborationService],
})
export class CollaborationModule {}

