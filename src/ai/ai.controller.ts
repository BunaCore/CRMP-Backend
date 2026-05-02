import { Controller, Post, Body, HttpCode, HttpStatus, ValidationPipe } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiRequestDto } from './dto/ai-request.dto';
import { AiResponseDto } from './dto/ai-response.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async handleAiChat(
    @Body(new ValidationPipe({ transform: true })) requestDto: AiRequestDto,
  ): Promise<AiResponseDto> {
    return this.aiService.handleRequest(requestDto);
  }
}
