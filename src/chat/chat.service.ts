import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChatRepository } from './chat.repository';
import { Chat, Message, MessageWithSender } from './types/chat.types';
import { ChatSidebarItemDto, LastMessageDto } from './dto/chat-sidebar.dto';
import {
  ChatMessagesPageDto,
  MessageDto,
  SenderDto,
} from './dto/chat-messages.dto';
import { ChatDetailDto } from './dto/chat-detail.dto';

@Injectable()
export class ChatService {
  constructor(private chatRepository: ChatRepository) {}

  /**
   * Unified chat creation (handles both DM and group)
   * - For DM: enforce exactly 1 other member, deduplicate existing
   * - For group: create with all members
   * Always includes currentUserId implicitly
   */
  async createChat(
    type: 'dm' | 'group',
    memberIds: string[],
    currentUserId: string,
    name?: string,
  ): Promise<Chat> {
    if (type === 'dm') {
      // DM validation
      if (memberIds.length !== 1) {
        throw new BadRequestException('DM must have exactly 1 other member');
      }

      const otherUserId = memberIds[0];
      if (otherUserId === currentUserId) {
        throw new BadRequestException('Cannot create DM with yourself');
      }

      // Check if DM already exists
      const existing = await this.chatRepository.findDmBetweenUsers(
        currentUserId,
        otherUserId,
      );
      if (existing) {
        return existing;
      }

      // Create new DM
      const chat = await this.chatRepository.createChat({
        type: 'dm',
        name: null,
        projectId: null,
        createdBy: currentUserId,
      });

      // Add both users
      await this.chatRepository.addMember(chat.id, currentUserId);
      await this.chatRepository.addMember(chat.id, otherUserId);

      return chat;
    } else {
      // Group chat creation
      if (!name || name.trim().length === 0) {
        throw new BadRequestException('Group name is required');
      }

      // Remove duplicates and current user from memberIds
      const uniqueMembers = [...new Set(memberIds)].filter(
        (id) => id !== currentUserId,
      );

      // Create chat
      const chat = await this.chatRepository.createChat({
        type: 'group',
        name: name.trim(),
        projectId: null,
        createdBy: currentUserId,
      });

      // Add creator as first member
      await this.chatRepository.addMember(chat.id, currentUserId);

      // Add other members
      for (const memberId of uniqueMembers) {
        await this.chatRepository.addMember(chat.id, memberId);
      }

      return chat;
    }
  }

  /**
   * Find a chat by ID
   * Returns null if not found
   */
  async findChatById(chatId: string): Promise<Chat | null> {
    return this.chatRepository.findChatById(chatId);
  }

  /**
   * Create a new group chat for a project
   * Should be called when a project is created
   */
  async createProjectChat(
    projectId: string,
    projectName: string,
    creatorId: string,
  ): Promise<Chat> {
    const chat = await this.chatRepository.createChat({
      type: 'group',
      name: `${projectName} - Chat`,
      projectId,
      createdBy: creatorId,
    });

    // Creator is automatically added as first member
    await this.chatRepository.addMember(chat.id, creatorId);

    return chat;
  }

  /**
   * Find or create DM between two users
   */
  async createOrGetDm(userId1: string, userId2: string): Promise<Chat> {
    if (userId1 === userId2) {
      throw new BadRequestException('Cannot create DM with yourself');
    }

    // Check if DM already exists
    const existing = await this.chatRepository.findDmBetweenUsers(
      userId1,
      userId2,
    );
    if (existing) {
      return existing;
    }

    // Create new DM
    const chat = await this.chatRepository.createChat({
      type: 'dm',
      name: null, // DM names are derived from members
      projectId: null,
      createdBy: userId1,
    });

    // Add both users
    await this.chatRepository.addMember(chat.id, userId1);
    await this.chatRepository.addMember(chat.id, userId2);

    return chat;
  }

  /**
   * Join a chat - returns last 50 messages
   * Validates user is member of chat
   */
  async joinChat(chatId: string, userId: string): Promise<MessageWithSender[]> {
    const chat = await this.chatRepository.findChatById(chatId);
    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    // Verify user is member
    const isMember = await this.chatRepository.isChatMember(chatId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    // Return recent messages (newest first, but client should reverse for display)
    const msgs = await this.chatRepository.getMessagesWithSender(chatId, 50);
    return msgs.reverse(); // Return oldest -> newest for client
  }

  /**
   * Send message to chat
   * Validates user is member before allowing send
   */
  async sendMessage(
    chatId: string,
    userId: string,
    content: string,
    tempId?: string,
  ): Promise<MessageWithSender> {
    // Validate chat exists
    const chat = await this.chatRepository.findChatById(chatId);
    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    // Validate user is member
    const isMember = await this.chatRepository.isChatMember(chatId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    // Validate content
    if (!content || content.trim().length === 0) {
      throw new BadRequestException('Message content cannot be empty');
    }

    if (content.length > 5000) {
      throw new BadRequestException('Message cannot exceed 5000 characters');
    }

    // Create message with sender info in single round trip
    const messageWithSender = await this.chatRepository.createMessageWithSender(
      chatId,
      userId,
      content.trim(),
    );

    // Include tempId if provided (for optimistic UI reconciliation)
    if (tempId) {
      return { ...messageWithSender, tempId } as any;
    }

    return messageWithSender;
  }

  /**
   * Add user to chat (for project chats automatically adding team members)
   */
  async addMember(chatId: string, userId: string): Promise<void> {
    const chat = await this.chatRepository.findChatById(chatId);
    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    await this.chatRepository.addMember(chatId, userId);
  }

  /**
   * Remove user from chat
   */
  async removeMember(chatId: string, userId: string): Promise<void> {
    const chat = await this.chatRepository.findChatById(chatId);
    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    await this.chatRepository.removeMember(chatId, userId);
  }

  /**
   * Get all chats for a user
   */
  async getUserChats(userId: string): Promise<Chat[]> {
    return this.chatRepository.getChatsByUserId(userId);
  }

  /**
   * Get all members of a chat
   */
  async getChatMembers(chatId: string): Promise<string[]> {
    const chat = await this.chatRepository.findChatById(chatId);
    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    return this.chatRepository.getChatMembers(chatId);
  }

  /**
   * Ensure user is member of chat (throws if not)
   * Used by gateway for membership validation
   */
  async ensureMember(chatId: string, userId: string): Promise<void> {
    const isMember = await this.chatRepository.isChatMember(chatId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this chat');
    }
  }

  /**
   * Get all chat IDs for a user (used for auto-join on connection)
   * Returns only IDs, not full chat objects (efficient)
   */
  async getUserChatIds(userId: string): Promise<string[]> {
    return this.chatRepository.getChatIdsByUserId(userId);
  }

  /**
   * Mark a chat as read
   * Updates lastReadAt timestamp in chat_members
   */
  async markChatAsRead(chatId: string, userId: string): Promise<void> {
    // Validate chat exists
    const chat = await this.chatRepository.findChatById(chatId);
    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    // Validate user is member
    const isMember = await this.chatRepository.isChatMember(chatId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    // Mark as read
    await this.chatRepository.markChatAsRead(chatId, userId);
  }

  /**
   * Get user's chats for sidebar with unread counts and last message
   * Maps repository result to ChatSidebarItemDto[]
   * Handles DM displayName + group displayName differently
   */
  async getUserChatsForSidebar(userId: string): Promise<ChatSidebarItemDto[]> {
    const chats =
      await this.chatRepository.findUserChatsWithLastMessage(userId);

    return chats.map((chat) => {
      // For DM: use other user's avatar; for group: use null (TODO: add group image support)
      let displayImage: string | null = null;
      if (chat.chatType === 'dm') {
        displayImage = chat._otherUserAvatar || null;
      }

      const item: ChatSidebarItemDto = {
        id: chat.chatId,
        type: chat.chatType,
        displayName: this.resolveDisplayName(
          chat.chatType,
          chat.chatName,
          chat._otherUserName || null,
        ),
        displayImage,
        unreadCount: chat._unreadCount,
      };

      // Add last message if exists (with full sender info for consistency)
      if (chat._lastMessageId) {
        item.lastMessage = {
          id: chat._lastMessageId,
          chatId: chat.chatId,
          content: chat._lastMessageContent || '',
          createdAt: chat._lastMessageCreatedAt || new Date(),
          sender: {
            id: chat._lastMessageSenderId || '',
            name: chat._lastMessageSenderName || 'Unknown',
            avatar: chat._lastMessageSenderAvatar || null,
          },
        };
      }

      return item;
    });
  }

  /**
   * Get paginated messages for a chat
   * Validates membership before returning
   * Returns messages oldest-first with cursor for next page
   */
  async getChatMessagesPage(
    chatId: string,
    userId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<ChatMessagesPageDto> {
    // Validate chat exists
    const chat = await this.chatRepository.findChatById(chatId);
    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    // Validate user is member
    const isMember = await this.chatRepository.isChatMember(chatId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    // Fetch messages (limit + 1 to check if more exist)
    const rows = await this.chatRepository.findMessagesByChatIdCursor(
      chatId,
      cursor,
      limit,
    );

    // Determine if there are more messages
    // If we fetched more than limit, there are more pages
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit);

    // Calculate nextCursor (createdAt of last message)
    const nextCursor =
      hasMore && messages.length > 0
        ? messages[messages.length - 1].createdAt?.toISOString()
        : null;

    // Map to MessageDto with standardized sender shape
    const messageDtos: MessageDto[] = messages.map((msg) => ({
      id: msg.id,
      chatId: msg.chatId,
      content: msg.content,
      createdAt: msg.createdAt,
      sender: {
        id: msg.senderId,
        name: msg.senderName,
        avatar: msg.senderAvatar,
      },
    }));

    return {
      messages: messageDtos,
      nextCursor,
    };
  }

  /**
   * Resolve display name based on chat type
   * - DM: use other member's name
   * - Group: use chat.name (project name or custom name)
   */
  private resolveDisplayName(
    type: 'dm' | 'group',
    chatName: string | null,
    otherUserName: string | null,
  ): string {
    if (type === 'dm') {
      return otherUserName || 'Unknown User';
    }
    return chatName || 'Unnamed Group';
  }

  /**
   * Get chat details with all members
   * Validates user is member before returning
   */
  async getChatDetails(chatId: string, userId: string): Promise<ChatDetailDto> {
    // Validate chat exists
    const chat = await this.chatRepository.findChatById(chatId);
    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    // Validate user is member
    const isMember = await this.chatRepository.isChatMember(chatId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    // Get full chat with members
    const chatWithMembers =
      await this.chatRepository.findChatWithMembers(chatId);
    if (!chatWithMembers) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    return {
      id: chatWithMembers.id,
      type: chatWithMembers.type,
      name: chatWithMembers.name,
      members: chatWithMembers.members.map((m) => ({
        id: m.id,
        name: m.fullName,
        email: m.email,
      })),
      createdAt: chatWithMembers.createdAt,
    };
  }
}
