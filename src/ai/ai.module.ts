import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GeminiService } from './providers/gemini.service';
import { OllamaService } from './providers/ollama.service';
import { ChatHandler } from './handlers/chat.handler';
import { SummarizeHandler } from './handlers/summarize.handler';
import { GrammarHandler } from './handlers/grammar.handler';
import { ExplainHandler } from './handlers/explain.handler';
import { OutlineHandler } from './handlers/outline.handler';
import { InsertHandler } from './handlers/insert.handler';

@Module({
  imports: [ConfigModule],
  controllers: [AiController],
  providers: [
    AiService,
    GeminiService,
    OllamaService,
    ChatHandler,
    SummarizeHandler,
    GrammarHandler,
    ExplainHandler,
    OutlineHandler,
    InsertHandler,
  ],
  exports: [AiService],
})
export class AiModule {}
