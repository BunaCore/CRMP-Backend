import { Injectable } from '@nestjs/common';
import { eq, and, desc, sql, gt, or, isNull } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { chats, chatMembers, messages } from 'src/db/schema/chat';
import { users } from 'src/db/schema/user';
import {
  Chat,
  ChatMember,
  Message,
  MessageWithSender,
  ChatWithMembers,
  ChatMemberDetail,
  CreateChatInput,
  ChatWithLastMessage,
} from './types/chat.types';

@Injectable()
export class ChatRepository {
  constructor(private drizzle: DrizzleService) {}

  /**
   * Create a new chat (group or DM)
   */
  async createChat(data: CreateChatInput): Promise<Chat> {
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
   * Create message and return with sender info in a single round trip
   * Optimized for real-time messaging (hot path)
   * Uses JOIN to avoid N+1 query
   *
   * Returns message with sender details for immediate broadcast
   */
  async createMessageWithSender(
    chatId: string,
    senderId: string,
    content: string,
  ): Promise<MessageWithSender> {
    // Insert message and get all fields back
    const [createdMessage] = await this.drizzle.db
      .insert(messages)
      .values({
        chatId,
        senderId,
        content,
      })
      .returning();

    // Single query to get sender info (name and avatar)
    const [senderRow] = await this.drizzle.db
      .select({
        id: users.id,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, senderId));

    return {
      ...createdMessage,
      sender: {
        id: senderRow?.id || senderId,
        name: senderRow?.fullName || 'Unknown',
        avatar: senderRow?.avatarUrl || null,
      },
    };
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
   * Get messages with sender info (name, avatar)
   */
  async getMessagesWithSender(
    chatId: string,
    take: number = 50,
  ): Promise<MessageWithSender[]> {
    const rows = await this.drizzle.db
      .select({
        message: messages,
        senderId: users.id,
        senderName: users.fullName,
        senderAvatar: users.avatarUrl,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.createdAt))
      .limit(take);

    return rows.map((row) => ({
      ...row.message,
      sender: {
        id: row.senderId || row.message.senderId,
        name: row.senderName || 'Unknown',
        avatar: row.senderAvatar || null,
      },
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

  /**
   * Get all chat IDs for a user (efficient - only IDs, no full chat objects)
   * Ordered by most recent message or join date
   */
  async getChatIdsByUserId(userId: string): Promise<string[]> {
    const rows = await this.drizzle.db
      .select({ chatId: chatMembers.chatId })
      .from(chatMembers)
      .where(eq(chatMembers.userId, userId))
      .orderBy(desc(chatMembers.joinedAt));

    return rows.map((r) => r.chatId);
  }

  /**
   * Mark a chat as read by updating lastReadAt timestamp
   */
  async markChatAsRead(chatId: string, userId: string): Promise<void> {
    await this.drizzle.db
      .update(chatMembers)
      .set({
        lastReadAt: new Date(),
      })
      .where(
        and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)),
      );
  }

  /**
   * Find all chats for a user with sidebar data (last message, unread count)
   * Returns flat structure optimized for REST API view model
   * - Includes last message with full sender info (name, avatar)
   * - For DMs, includes other member's avatar for displayImage
   * - Sorted by last message creation date (descending) for proper sidebar ordering
   */
  async findUserChatsWithLastMessage(
    userId: string,
  ): Promise<ChatWithLastMessage[]> {
    // Get user's chats with lastReadAt
    const userChats = await this.drizzle.db
      .select({
        chatId: chats.id,
        chatType: chats.type,
        chatName: chats.name,
        lastReadAt: chatMembers.lastReadAt,
      })
      .from(chatMembers)
      .innerJoin(chats, eq(chatMembers.chatId, chats.id))
      .where(eq(chatMembers.userId, userId));

    // Fetch last message and unread count for each chat
    const result: any = [];
    for (const chat of userChats) {
      // Get last message with sender name and avatar
      const [lastMsg] = await this.drizzle.db
        .select({
          id: messages.id,
          content: messages.content,
          createdAt: messages.createdAt,
          senderId: messages.senderId,
          senderName: users.fullName,
          senderAvatar: users.avatarUrl,
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.chatId, chat.chatId))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const whereClause = chat.lastReadAt
        ? and(
            eq(messages.chatId, chat.chatId),
            gt(messages.createdAt, chat.lastReadAt),
          )
        : eq(messages.chatId, chat.chatId);

      // Count unread messages (created after lastReadAt)
      const unreadRows = await this.drizzle.db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(whereClause);
      const unreadCount = unreadRows[0] ? Number(unreadRows[0].count || 0) : 0;

      const row: any = {
        chatId: chat.chatId,
        chatType: chat.chatType,
        chatName: chat.chatName,
        lastReadAt: chat.lastReadAt,
        _lastMessageId: lastMsg?.id || null,
        _lastMessageContent: lastMsg?.content || null,
        _lastMessageCreatedAt: lastMsg?.createdAt || null,
        _lastMessageSenderId: lastMsg?.senderId || null,
        _lastMessageSenderName: lastMsg?.senderName || null,
        _lastMessageSenderAvatar: lastMsg?.senderAvatar || null,
        _unreadCount: unreadCount,
      };

      // For DMs, fetch the other member with avatar
      if (chat.chatType === 'dm') {
        const memberRows = await this.drizzle.db
          .select({
            userId: chatMembers.userId,
            fullName: users.fullName,
            avatarUrl: users.avatarUrl,
          })
          .from(chatMembers)
          .leftJoin(users, eq(chatMembers.userId, users.id))
          .where(eq(chatMembers.chatId, chat.chatId));

        const otherMember = memberRows.find((r) => r.userId !== userId);
        row._otherUserId = otherMember?.userId || null;
        row._otherUserName = otherMember?.fullName || null;
        row._otherUserAvatar = otherMember?.avatarUrl || null;
      }

      // Add row to result array
      result.push(row);
    }

    // Sort by last message creation date (DESC) so active chats bubble up
    result.sort((a: any, b: any) => {
      const aDate = a._lastMessageCreatedAt
        ? new Date(a._lastMessageCreatedAt).getTime()
        : 0;
      const bDate = b._lastMessageCreatedAt
        ? new Date(b._lastMessageCreatedAt).getTime()
        : 0;
      return bDate - aDate;
    });

    return result;
  }

  /**
   * Find messages in a chat with cursor-based pagination
   * Cursor = message createdAt (ISO string)
   * Returns messages ordered newest-first (reverse for display)
   * Includes sender info
   */
  async findMessagesByChatIdCursor(
    chatId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<
    Array<{
      id: string;
      chatId: string;
      content: string;
      createdAt: Date | null;
      senderId: string;
      senderName: string;
      senderAvatar: string | null;
    }>
  > {
    const whereConditions = [eq(messages.chatId, chatId)];

    // If cursor provided, fetch messages before that timestamp
    if (cursor) {
      const cursorDate = new Date(cursor);
      whereConditions.push(sql`${messages.createdAt} < ${cursorDate}`);
    }

    const rows = await this.drizzle.db
      .select({
        id: messages.id,
        chatId: messages.chatId,
        content: messages.content,
        createdAt: messages.createdAt,
        senderId: messages.senderId,
        senderName: users.fullName,
        senderAvatar: users.avatarUrl,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(and(...whereConditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1); // Fetch one extra to determine if there are more

    // Map results: slice to limit, return with nextCursor if more exist
    const hasMore = rows.length > limit;
    const paginatedRows = rows.slice(0, limit);

    return paginatedRows.map((row) => ({
      id: row.id,
      chatId: row.chatId,
      content: row.content,
      createdAt: row.createdAt,
      senderId: row.senderId,
      senderName: row.senderName || 'Unknown',
      senderAvatar: row.senderAvatar || null,
    }));
  }

  /**
   * Find a chat with all its members
   * Useful for GET /chats/:id endpoint
   */
  async findChatWithMembers(chatId: string): Promise<ChatWithMembers | null> {
    const chat = await this.findChatById(chatId);
    if (!chat) {
      return null;
    }

    // Get all members with user details
    const memberRows = await this.drizzle.db
      .select({
        id: chatMembers.userId,
        fullName: users.fullName,
        email: users.email,
      })
      .from(chatMembers)
      .leftJoin(users, eq(chatMembers.userId, users.id))
      .where(eq(chatMembers.chatId, chatId));

    return {
      id: chat.id,
      type: chat.type,
      name: chat.name,
      createdAt: chat.createdAt || new Date(),
      members: memberRows.map((row) => ({
        id: row.id,
        fullName: row.fullName || 'Unknown',
        email: row.email || 'unknown@example.com',
      })),
    };
  }
}
