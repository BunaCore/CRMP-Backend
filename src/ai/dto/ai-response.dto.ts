export class AiResponseResult {
  reply: string;
  replacement?: string;
  summary?: string;
  outline?: string[];
}

export class AiResponseAction {
  type: 'none' | 'replace' | 'insert' | 'highlight';
  from?: number | null;
  to?: number | null;
  content?: string | null;
}

export class AiResponseMeta {
  provider: 'ollama' | 'gemini';
  model: string;
  aiMode: 'local' | 'cloud';
}

export class AiResponseDto {
  requestType: string;
  result: AiResponseResult;
  action: AiResponseAction;
  meta: AiResponseMeta;
}
