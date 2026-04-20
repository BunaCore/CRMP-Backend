import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatSidebarItemDto } from './dto/chat-sidebar.dto';
import { ChatMessagesPageDto } from './dto/chat-messages.dto';
import { ChatDetailDto } from './dto/chat-detail.dto';
import { CreateChatDto } from './dto/create-chat.dto';
import { AddMembersDto } from './dto/add-members.dto';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

/**
 * Chat REST API Controller
 * Clean intent-driven design:
 * - POST /chats - Create DM or group
 * - GET /chats - Sidebar with unread counts
 * - GET /chats/:id - Chat details with members
 * - POST /chats/:id/members - Add members (groups only)
 * - DELETE /chats/:id/members/:userId - Remove member
 * - POST /chats/:id/messages - Send message
 * - GET /chats/:id/messages - Paginated messages
 */
@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  /**
   * POST /chats
   * Create a new chat (DM or group)
   *
   * For DM: memberIds must contain exactly 1 user
   * For group: memberIds can contain any number of users
   * Current user is always included implicitly
   *
   * Body:
   * {
   *   "type": "dm" | "group",
   *   "memberIds": ["user-id"],
   *   "name": "Group Name" (required for groups, ignored for DM)
   * }
   */
  @Post()
  async createChat(
    @Body() dto: CreateChatDto,
    @CurrentUser('id') currentUserId: string,
  ) {
    // Validate DM memberIds
    if (dto.type === 'dm' && dto.memberIds.length !== 1) {
      throw new BadRequestException('DM must have exactly 1 other member');
    }

    const chat = await this.chatService.createChat(
      dto.type,
      dto.memberIds,
      currentUserId,
      dto.name,
    );

    return {
      id: chat.id,
      type: chat.type,
      name: chat.name,
    };
  }

  /**
   * GET /chats
   * Get user's chats for sidebar
   * Returns list of chats with unread count and last message
   */
  @Get()
  async getSidebar(
    @CurrentUser('id') userId: string,
  ): Promise<ChatSidebarItemDto[]> {
    return this.chatService.getUserChatsForSidebar(userId);
  }

  /**
   * GET /chats/:id
   * Get single chat with all members
   * Validates user is member before returning
   */
  @Get(':id')
  async getChat(
    @Param('id') chatId: string,
    @CurrentUser('id') userId: string,
  ): Promise<ChatDetailDto> {
    return this.chatService.getChatDetails(chatId, userId);
  }

  /**
   * POST /chats/:id/messages
   * Send a message to a chat
   *
   * Returns message with:
   * - id, chatId, content, createdAt
   * - sender: { id, name, avatar }
   *
   * Body:
   * {
   *   "content": "Message text"
   * }
   */
  @Post(':id/messages')
  async sendMessage(
    @Param('id') chatId: string,
    @Body('content') content: string,
    @CurrentUser('id') userId: string,
  ) {
    if (
      !content ||
      typeof content !== 'string' ||
      content.trim().length === 0
    ) {
      throw new BadRequestException('Message content cannot be empty');
    }

    if (content.length > 5000) {
      throw new BadRequestException('Message cannot exceed 5000 characters');
    }

    const message = await this.chatService.sendMessage(
      chatId,
      userId,
      content.trim(),
    );

    // Return message with standardized sender shape (same as Socket.IO)
    return {
      id: message.id,
      chatId: message.chatId,
      content: message.content,
      createdAt: message.createdAt,
      sender: message.sender,
    };
  }

  /**
   * GET /chats/:id/messages
   * Get paginated messages for a chat
   * Query params:
   * - cursor: ISO timestamp of last message (for pagination)
   * - limit: number of messages to fetch (default 20, max 100)
   */
  @Get(':id/messages')
  async getMessages(
    @Param('id') chatId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @CurrentUser('id') userId?: string,
  ): Promise<ChatMessagesPageDto> {
    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    // Parse and validate limit parameter
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('Limit must be a number between 1 and 100');
    }

    // Validate cursor if provided (must be a valid ISO 8601 timestamp)
    if (cursor) {
      const parsedCursorDate = new Date(cursor);
      if (isNaN(parsedCursorDate.getTime())) {
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

  /**
   * POST /chats/:id/members
   * Add members to a group chat
   * Only allowed for group chats
   *
   * Body:
   * {
   *   "userIds": ["user-id-1", "user-id-2"]
   * }
   */
  @Post(':id/members')
  @HttpCode(200)
  async addMembers(
    @Param('id') chatId: string,
    @Body() dto: AddMembersDto,
    @CurrentUser('id') userId: string,
  ) {
    // Validate chat exists and is a group
    const chat = await this.chatService.findChatById(chatId);
    if (!chat) {
      throw new BadRequestException('Chat not found');
    }

    if (chat.type !== 'group') {
      throw new BadRequestException('Can only add members to group chats');
    }

    // Validate user is member
    await this.chatService.ensureMember(chatId, userId);

    // Add members
    for (const memberId of dto.userIds) {
      if (memberId !== userId) {
        // Don't re-add self
        await this.chatService.addMember(chatId, memberId);
      }
    }

    return {
      success: true,
      message: `Added ${dto.userIds.length} member(s) to chat`,
    };
  }

  /**
   * DELETE /chats/:id/members/:userId
   * Remove a member from a chat
   * Users can remove themselves
   * Admins can remove others (future feature)
   */
  @Delete(':id/members/:memberId')
  @HttpCode(200)
  async removeMember(
    @Param('id') chatId: string,
    @Param('memberId') memberId: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    // Validate chat exists
    const chat = await this.chatService.findChatById(chatId);
    if (!chat) {
      throw new BadRequestException('Chat not found');
    }

    // Validate user is member of chat
    await this.chatService.ensureMember(chatId, currentUserId);

    // Users can remove themselves or admins can remove others
    // For now, allow if removing self or if requester is in the chat
    if (memberId !== currentUserId) {
      // TODO: Add role-based permission check here
      // For now, only allow self-removal
      throw new BadRequestException('Can only remove yourself from chat');
    }

    // Remove member
    await this.chatService.removeMember(chatId, memberId);

    return {
      success: true,
      message: `Removed member from chat`,
    };
  }
}
