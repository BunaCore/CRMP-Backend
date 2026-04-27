import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AccessControlModule } from './access-control';
import { ProposalsModule } from './proposals/proposals.module';
import { UndergradModule } from './undergrad/undergrad.module';
import { PgModule } from './pg/pg.module';
import { DepartmentsModule } from './departments/departments.module';
import { FilesModule } from './common/files/files.module';
import { MailModule } from './mail/mail.module';
import { DocumentsModule } from './documents/documents.module';
import { ProjectsModule } from './projects/projects.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ChatModule } from './chat/chat.module';
import { QueuesModule } from './queues/queues.module';
import { AppLoggerModule } from './common/logger/logger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AppLoggerModule,
    DbModule,
    UsersModule,
    AuthModule,
    AccessControlModule,
    FilesModule,
    ProposalsModule,
    UndergradModule,
    PgModule,
    DepartmentsModule,
    MailModule,
    DocumentsModule,
    ProjectsModule,
    WorkspacesModule,
    ChatModule,
    RealtimeModule,
    QueuesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
