import { Injectable, BadRequestException } from '@nestjs/common';
import { AiRequestDto } from './dto/ai-request.dto';
import { AiResponseDto } from './dto/ai-response.dto';
import { GeminiService } from './providers/gemini.service';
import { OllamaService } from './providers/ollama.service';
import { ChatHandler } from './handlers/chat.handler';
import { SummarizeHandler } from './handlers/summarize.handler';
import { GrammarHandler } from './handlers/grammar.handler';
import { ExplainHandler } from './handlers/explain.handler';
import { OutlineHandler } from './handlers/outline.handler';
import { InsertHandler } from './handlers/insert.handler';
import { cleanAiOutput } from './utils/text-cleaner';
import { parseOutline } from './utils/response-parser';

@Injectable()
export class AiService {
  constructor(
    private readonly geminiService: GeminiService,
    private readonly ollamaService: OllamaService,
    private readonly chatHandler: ChatHandler,
    private readonly summarizeHandler: SummarizeHandler,
    private readonly grammarHandler: GrammarHandler,
    private readonly explainHandler: ExplainHandler,
    private readonly outlineHandler: OutlineHandler,
    private readonly insertHandler: InsertHandler,
  ) {}

  async handleRequest(dto: AiRequestDto): Promise<AiResponseDto> {
    let handler;
    
    switch (dto.requestType) {
      case 'CHAT_QUESTION': handler = this.chatHandler; break;
      case 'SUMMARIZE_SELECTION': handler = this.summarizeHandler; break;
      case 'GRAMMAR_FIX': handler = this.grammarHandler; break;
      case 'EXPLAIN_SELECTION': handler = this.explainHandler; break;
      case 'OUTLINE_SUGGESTION': handler = this.outlineHandler; break;
      case 'INSERT_SUGGESTION': handler = this.insertHandler; break;
      default: handler = this.chatHandler;
    }

    let requestConfig;
    try {
      requestConfig = handler.buildRequest(dto);
    } catch (e) {
      return this.buildErrorResponse(dto, e.message);
    }

    // Ignore history for strict action modes
    const isStrictMode = ['SUMMARIZE_SELECTION', 'GRAMMAR_FIX', 'EXPLAIN_SELECTION', 'OUTLINE_SUGGESTION', 'INSERT_SUGGESTION'].includes(dto.requestType);
    const historyToUse = isStrictMode ? [] : dto.history;

    let generatedText = '';
    const providerName = dto.aiMode === 'cloud' ? 'gemini' : 'ollama';
    const modelName = dto.aiMode === 'cloud' ? 'gemini-flash-latest' : 'llama3.2:1b';

    if (dto.aiMode === 'cloud') {
      generatedText = await this.geminiService.generate(requestConfig.prompt, requestConfig.systemPrompt, historyToUse);
    } else if (dto.aiMode === 'local') {
      generatedText = await this.ollamaService.generate(requestConfig.prompt, requestConfig.systemPrompt, historyToUse);
    } else {
      throw new BadRequestException(`Unsupported aiMode: ${dto.aiMode}`);
    }

    const cleanedText = cleanAiOutput(generatedText);

    // Build the result payload based on requestType
    const result: any = { reply: cleanedText };
    const actionPayload: any = {
      type: requestConfig.action.type,
      from: dto.from ?? null,
      to: dto.to ?? null,
      content: null
    };

    if (dto.requestType === 'GRAMMAR_FIX' || dto.requestType === 'INSERT_SUGGESTION') {
      result.replacement = cleanedText;
      actionPayload.content = cleanedText;
    } else if (dto.requestType === 'SUMMARIZE_SELECTION') {
      result.summary = cleanedText;
    } else if (dto.requestType === 'OUTLINE_SUGGESTION') {
      result.outline = parseOutline(cleanedText);
    }

    return {
      requestType: dto.requestType,
      result: result,
      action: actionPayload,
      meta: {
        provider: providerName,
        model: modelName,
        aiMode: dto.aiMode,
      }
    };
  }

  private buildErrorResponse(dto: AiRequestDto, message: string): AiResponseDto {
    return {
      requestType: dto.requestType,
      result: { reply: `[Error]: ${message}` },
      action: { type: 'none', from: null, to: null, content: null },
      meta: {
        provider: dto.aiMode === 'cloud' ? 'gemini' : 'ollama',
        model: dto.aiMode === 'cloud' ? 'gemini-flash-latest' : 'llama3.2:1b',
        aiMode: dto.aiMode as any,
      }
    };
  }
}
