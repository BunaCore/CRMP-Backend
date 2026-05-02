import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey && apiKey !== 'your_key_here') {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    } else {
      this.logger.warn('GEMINI_API_KEY is not defined or is invalid in environment variables.');
    }
  }

  async generate(prompt: string, systemPrompt?: string, history?: any[]): Promise<string> {
    if (!this.genAI || !this.model) {
      return '[Error]: Gemini Cloud is not configured properly. Missing API key.';
    }

    try {
      let activeModel = this.model;
      
      // Use systemInstruction config for strict action behavior
      if (systemPrompt) {
        activeModel = this.genAI.getGenerativeModel({ 
          model: 'gemini-flash-latest',
          systemInstruction: systemPrompt 
        });
      }

      let chatSession;
      if (history && history.length > 0) {
        // Gemini strictly requires alternating user/model roles. Merge consecutive roles.
        const formattedHistory: any[] = [];
        let lastRole: string | null = null;
        
        for (const msg of history) {
          const role = msg.role === 'user' ? 'user' : 'model';
          const text = msg.content || ' '; // Prevent empty text parts
          
          if (role === lastRole) {
            formattedHistory[formattedHistory.length - 1].parts[0].text += '\n\n' + text;
          } else {
            formattedHistory.push({ role, parts: [{ text }] });
            lastRole = role;
          }
        }

        // Gemini strictly requires the FIRST message to be from 'user'
        if (formattedHistory.length > 0 && formattedHistory[0].role === 'model') {
          formattedHistory.shift(); // Drop the leading model message
        }
        
        chatSession = activeModel.startChat({
          history: formattedHistory,
        });
      } else {
        chatSession = activeModel.startChat({ history: [] });
      }

      const result = await chatSession.sendMessage(prompt);
      return result.response.text();
    } catch (error) {
      this.logger.error(`Gemini Cloud Generation failed: ${error.message}`, error.stack);
      // Return the exact error to the frontend so we can debug if it's an API Key or Region issue
      return `[Error]: Gemini AI service failed: ${error.message}`;
    }
  }
}
