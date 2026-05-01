import { Injectable } from '@nestjs/common';
import { AiRequestDto } from '../dto/ai-request.dto';
import { SYSTEM_PROMPTS } from '../prompts/system.prompts';

@Injectable()
export class ChatHandler {
  buildRequest(dto: AiRequestDto) {
    let prompt = dto.message || '';
    if (dto.context) {
      prompt = `Context:\n${dto.context}\n\nQuestion: ${prompt}`;
    }

    return {
      systemPrompt: SYSTEM_PROMPTS.CHAT,
      prompt: prompt,
      action: { type: 'none' as const, from: null, to: null }
    };
  }
}
