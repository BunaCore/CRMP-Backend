import { Injectable } from '@nestjs/common';
import { AiRequestDto } from '../dto/ai-request.dto';
import { SYSTEM_PROMPTS } from '../prompts/system.prompts';
import { REQUEST_PROMPTS } from '../prompts/request.prompts';

@Injectable()
export class GrammarHandler {
  buildRequest(dto: AiRequestDto) {
    if (!dto.context || dto.context.trim() === '') {
      throw new Error("Context is empty");
    }

    return {
      systemPrompt: SYSTEM_PROMPTS.STRICT_ACTION,
      prompt: REQUEST_PROMPTS.GRAMMAR_FIX(dto.context),
      action: {
        type: 'replace' as const,
        from: dto.from ?? null,
        to: dto.to ?? null,
      }
    };
  }
}
