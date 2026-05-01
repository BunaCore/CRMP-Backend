import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly ollamaUrl: string;

  constructor(private configService: ConfigService) {
    this.ollamaUrl = this.configService.get<string>('OLLAMA_URL', 'http://localhost:11434');
  }

  async generate(prompt: string, systemPrompt?: string, history?: any[]): Promise<string> {
    try {
      const messages: any[] = [];
      
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      if (history && history.length > 0) {
        history.forEach(msg => {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          });
        });
      }

      messages.push({ role: 'user', content: prompt });

      const response = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2:1b', // Always explicitly target the exact local model
          messages: messages,
          stream: false,
          options: {
            temperature: 0.1, // Keep outputs strict and predictable
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API responded with status: ${response.status}`);
      }

      const data = await response.json();
      return data.message?.content || '';
    } catch (error) {
      this.logger.error(`Ollama Local Generation failed: ${error.message}`, error.stack);
      return '[Error]: Local AI service is not running or encountered an issue. Ensure Ollama is started.';
    }
  }
}
