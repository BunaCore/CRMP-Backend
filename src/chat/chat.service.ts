import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChatRepository } from './chat.repository';
import { Chat, Message, MessageWithSender } from './types/chat.types';

@Injectable()
export class ChatService {
  constructor(private chatRepository: ChatRepository) {}

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

    // Create message
    const message = await this.chatRepository.createMessage(
      chatId,
      userId,
      content.trim(),
    );

    // Fetch sender info for response
    const [messageWithSender] = await this.chatRepository.getMessagesWithSender(
      chatId,
      1,
    );

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
}
