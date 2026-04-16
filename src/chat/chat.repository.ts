import { Injectable } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { chats, chatMembers, messages } from 'src/db/schema/chat';
import { users } from 'src/db/schema/user';
import {
  Chat,
  ChatMember,
  Message,
  MessageWithSender,
} from './types/chat.types';

@Injectable()
export class ChatRepository {
  constructor(private drizzle: DrizzleService) {}

  /**
   * Create a new chat (group or DM)
   */
  async createChat(data: {
    type: 'group' | 'dm';
    name?: string | null;
    projectId?: string | null;
    createdBy: string;
  }): Promise<Chat> {
    const [chat] = await this.drizzle.db
      .insert(chats)
      .values({
        type: data.type,
        name: data.name || null,
        projectId: data.projectId || null,
        createdBy: data.createdBy,
      })
      .returning();

    return chat;
  }

  /**
   * Find chat by ID
   */
  async findChatById(chatId: string): Promise<Chat | null> {
    const [chat] = await this.drizzle.db
      .select()
      .from(chats)
      .where(eq(chats.id, chatId));

    return chat || null;
  }

  /**
   * Check if user is member of chat
   */
  async isChatMember(chatId: string, userId: string): Promise<boolean> {
    const [member] = await this.drizzle.db
      .select()
      .from(chatMembers)
      .where(
        and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)),
      );

    return !!member;
  }

  /**
   * Add user to chat
   */
  async addMember(chatId: string, userId: string): Promise<void> {
    await this.drizzle.db
      .insert(chatMembers)
      .values({
        chatId,
        userId,
      })
      .onConflictDoNothing(); // Silently ignore if already member
  }

  /**
   * Remove user from chat
   */
  async removeMember(chatId: string, userId: string): Promise<void> {
    await this.drizzle.db
      .delete(chatMembers)
      .where(
        and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)),
      );
  }

  /**
   * Create a message
   */
  async createMessage(
    chatId: string,
    senderId: string,
    content: string,
  ): Promise<Message> {
    const [message] = await this.drizzle.db
      .insert(messages)
      .values({
        chatId,
        senderId,
        content,
      })
      .returning();

    return message;
  }

  /**
   * Get last N messages for a chat, ordered newest first
   */
  async getMessages(chatId: string, take: number = 50): Promise<Message[]> {
    return this.drizzle.db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.createdAt))
      .limit(take);
  }

  /**
   * Get messages with sender info (name, email)
   */
  async getMessagesWithSender(
    chatId: string,
    take: number = 50,
  ): Promise<MessageWithSender[]> {
    const rows = await this.drizzle.db
      .select({
        message: messages,
        senderName: users.fullName,
        senderEmail: users.email,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.createdAt))
      .limit(take);

    return rows.map((row) => ({
      ...row.message,
      senderName: row.senderName || 'Unknown',
      senderEmail: row.senderEmail || 'unknown@example.com',
    }));
  }

  /**
   * Get all chats for a user (both group and DMs where user is member)
   */
  async getChatsByUserId(userId: string): Promise<Chat[]> {
    return this.drizzle.db
      .select({
        chat: chats,
      })
      .from(chats)
      .innerJoin(chatMembers, eq(chats.id, chatMembers.chatId))
      .where(eq(chatMembers.userId, userId))
      .then((rows) => rows.map((r) => r.chat));
  }

  /**
   * Get all members of a chat
   */
  async getChatMembers(chatId: string): Promise<string[]> {
    const rows = await this.drizzle.db
      .select({ userId: chatMembers.userId })
      .from(chatMembers)
      .where(eq(chatMembers.chatId, chatId));

    return rows.map((r) => r.userId);
  }

  /**
   * Find or check for existing DM between two users
   * Searches for a chat where both users are members and type is 'dm'
   */
  async findDmBetweenUsers(
    userId1: string,
    userId2: string,
  ): Promise<Chat | null> {
    // Get all DMs for user1
    const dmChats = await this.drizzle.db
      .select({ chat: chats })
      .from(chats)
      .innerJoin(chatMembers, eq(chats.id, chatMembers.chatId))
      .where(and(eq(chats.type, 'dm'), eq(chatMembers.userId, userId1)));

    // Filter for chats that also contain userId2
    for (const { chat } of dmChats) {
      const isMember = await this.isChatMember(chat.id, userId2);
      if (isMember) {
        return chat;
      }
    }

    return null;
  }
}
