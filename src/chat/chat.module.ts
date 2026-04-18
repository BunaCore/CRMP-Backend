import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatRepository } from './chat.repository';
import { DbModule } from 'src/db/db.module';

@Module({
  imports: [DbModule],
  providers: [ChatService, ChatRepository],
  exports: [ChatService, ChatRepository],
})
export class ChatModule {}
