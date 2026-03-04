import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { DbModule } from './db/db.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AccessControlModule } from './access-control';
import { ProposalsModule } from './proposals/proposals.module';
import { UndergradModule } from './undergrad/undergrad.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DbModule,
    UsersModule,
    AuthModule,
    AccessControlModule,
    ProposalsModule,
    UndergradModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
