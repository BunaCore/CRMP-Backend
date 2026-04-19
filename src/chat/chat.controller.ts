import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatSidebarItemDto } from './dto/chat-sidebar.dto';
import { ChatMessagesPageDto } from './dto/chat-messages.dto';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

/**
 * Chat REST API Controller
 * Provides endpoints for:
 * - GET /chats - sidebar with unread counts
 * - GET /chats/:id/messages - paginated messages
 */
@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  /**
   * GET /chats
   * Get user's chats for sidebar
   * Returns list of chats with unread count and last message
   */
  @Get()
  async getSidebar(
    @CurrentUser('sub') userId: string,
  ): Promise<ChatSidebarItemDto[]> {
    return this.chatService.getUserChatsForSidebar(userId);
  }

  /**
   * GET /chats/:id/messages
   * Get paginated messages for a chat
   * Query params:
   * - cursor: ISO timestamp of last message (for pagination)
   * - limit: number of messages to fetch (default 20)
   */
  @Get(':id/messages')
  async getMessages(
    @Param('id') chatId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @CurrentUser('sub') userId?: string,
  ): Promise<ChatMessagesPageDto> {
    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    // Parse and validate limit parameter
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('Limit must be a number between 1 and 100');
    }

    // Validate cursor if provided
    if (cursor) {
      try {
        new Date(cursor);
      } catch {
        throw new BadRequestException('Cursor must be a valid ISO timestamp');
      }
    }

    return this.chatService.getChatMessagesPage(
      chatId,
      userId,
      cursor,
      parsedLimit,
    );
  }
}
