import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, ForbiddenException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from 'src/chat/chat.service';
import {
  PresenceUpdateEvent,
  PresenceSyncEvent,
  type MarkChatAsReadEvent,
} from 'src/chat/types/presence.types';

/**
 * JWT payload structure from AuthService
 * Contains minimal info: user ID and role
 */
interface JwtPayload {
  sub: string; // User ID
  role: string; // User role
  iat?: number; // Issued at
  exp?: number; // Expiry
}

/**
 * Socket data structure for authenticated connections
 */
interface SocketData {
  userId: string;
  role: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly activeUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private chatService: ChatService,
  ) {}

  /**
   * Handle client connection
   * Verify JWT token from handshake auth
   */
  async handleConnection(client: Socket) {
    const token = client.handshake.headers['authorization'];

    if (!token) {
      this.logger.warn(`[${client.id}] Connection rejected: no token provided`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      }) as JwtPayload;

      const userId = payload.sub;
      // 1. Track the socket
      if (!this.activeUsers.has(userId)) {
        this.activeUsers.set(userId, new Set());
        // 2. FIRST TIME: This is the user's first tab. Broadcast they are ONLINE.
        const presenceUpdate: PresenceUpdateEvent = {
          userId,
          status: 'online',
          timestamp: new Date(),
        };
        this.server.emit('presence:update', presenceUpdate);
      }

      this.activeUsers.get(userId)!.add(client.id);
      // Attach user data to socket
      const socketData: SocketData = {
        userId: payload.sub,
        role: payload.role,
      };
      client.data = socketData;

      this.logger.log(
        `[${client.id}] User ${payload.sub} (role: ${payload.role}) connected`,
      );

      // Auto-join user to all their chat rooms
      try {
        const chatIds = await this.chatService.getUserChatIds(userId);
        for (const chatId of chatIds) {
          client.join(`chat:${chatId}`);
        }
        this.logger.debug(
          `[${client.id}] User ${userId} auto-joined ${chatIds.length} chat rooms`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `[${client.id}] Failed to auto-join chats: ${errorMessage}`,
        );
      }

      // Send presence sync - list of currently online users
      const onlineUserIds = Array.from(this.activeUsers.keys());
      const presenceSync: PresenceSyncEvent = { onlineUserIds };
      client.emit('presence:sync', presenceSync);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `[${client.id}] Connection rejected: invalid token - ${errorMessage}`,
      );
      client.disconnect(true);
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    const userId = (client.data as SocketData)?.userId;
    const userSockets = this.activeUsers.get(userId);
    if (userSockets) {
      userSockets.delete(client.id);
      if (userSockets.size === 0) {
        this.activeUsers.delete(userId);
        // User has no more active connections, broadcast they are OFFLINE
        const presenceUpdate: PresenceUpdateEvent = {
          userId,
          status: 'offline',
          timestamp: new Date(),
        };
        this.server.emit('presence:update', presenceUpdate);
      }
    }
    this.logger.log(`[${client.id}] User ${userId || 'unknown'} disconnected`);
  }

  // ========================= CHAT EVENTS =========================

  /**
   * Event: chat:join
   * Join a chat room and receive message history
   * Validates user is member of chat
   */
  @SubscribeMessage('chat:join')
  async onChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chatId: string },
  ) {
    const { userId } = client.data as SocketData;
    const { chatId } = payload;

    if (!chatId) {
      client.emit('chat:error', { message: 'chatId is required' });
      return;
    }

    try {
      // Validate membership and get history
      await this.chatService.joinChat(chatId, userId);

      // Join Socket.IO room
      client.join(`chat:${chatId}`);

      // Notify others in room
      client.to(`chat:${chatId}`).emit('chat:userJoined', {
        userId,
        timestamp: new Date(),
      });

      this.logger.log(`[${client.id}] User ${userId} joined chat ${chatId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`[${client.id}] Join chat failed: ${errorMessage}`);
      client.emit('chat:error', {
        message: errorMessage || 'Failed to join chat',
      });
    }
  }

  /**
   * Event: chat:sendMessage
   * Send message to chat room
   * Validates user is member before sending
   *
   * Payload:
   * {
   *   chatId: string
   *   content: string
   *   tempId?: string (for optimistic UI reconciliation)
   * }
   *
   * Broadcasts: chat:message to all users in room (including sender)
   * On error: sends chat:error to sender only (with tempId for reconciliation)
   */
  @SubscribeMessage('chat:sendMessage')
  async onSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      chatId: string;
      content: string;
      tempId?: string;
    },
  ) {
    const { userId } = client.data as SocketData;
    const { chatId, content, tempId } = payload;

    // Validate required fields
    if (!chatId || !content) {
      client.emit('chat:error', {
        tempId,
        message: 'chatId and content are required',
      });
      return;
    }

    try {
      // Send message with validation (membership, content length, etc)
      // Returns message with sender info in single round trip
      const message = await this.chatService.sendMessage(
        chatId,
        userId,
        content,
        tempId,
      );

      // Broadcast to all users in room (including sender)
      // Message includes sender info so frontend doesn't need extra lookup
      this.server.to(`chat:${chatId}`).emit('chat:message', message);

      this.logger.debug(
        `[${client.id}] User ${userId} sent message to chat ${chatId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.warn(`[${client.id}] Send message failed: ${errorMessage}`);

      // Emit error to sender only (not to room)
      // Include tempId for optimistic UI reconciliation
      client.emit('chat:error', {
        tempId,
        message: errorMessage || 'Failed to send message',
      });
    }
  }

  /**
   * Event: chat:typing
   * Broadcast typing indicator to room
   * No persistence, just real-time notification
   */
  @SubscribeMessage('chat:typing')
  onChatTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chatId: string; isTyping: boolean },
  ) {
    const { userId } = client.data as SocketData;
    const { chatId, isTyping } = payload;

    if (!chatId) {
      return;
    }

    // Broadcast to others in room
    client.to(`chat:${chatId}`).emit('chat:typing', {
      userId,
      isTyping,
      timestamp: new Date(),
    });

    this.logger.debug(
      `[${client.id}] User ${userId} typing in chat ${chatId}: ${isTyping}`,
    );
  }

  /**
   * Event: chat:leave
   * Leave a chat room
   */
  @SubscribeMessage('chat:leave')
  onChatLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chatId: string },
  ) {
    const { userId } = client.data as SocketData;
    const { chatId } = payload;

    if (!chatId) {
      return;
    }

    // Leave Socket.IO room
    client.leave(`chat:${chatId}`);

    // Notify others
    client.to(`chat:${chatId}`).emit('chat:userLeft', {
      userId,
      timestamp: new Date(),
    });

    this.logger.log(`[${client.id}] User ${userId} left chat ${chatId}`);
  }

  /**
   * Event: chat:markAsRead
   * Mark a chat as read - updates lastReadAt timestamp
   */
  @SubscribeMessage('chat:markAsRead')
  async onMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MarkChatAsReadEvent,
  ) {
    const { userId } = client.data as SocketData;
    const { chatId } = payload;

    if (!chatId) {
      client.emit('chat:error', { message: 'chatId is required' });
      return;
    }

    try {
      await this.chatService.markChatAsRead(chatId, userId);
      this.logger.debug(
        `[${client.id}] User ${userId} marked chat ${chatId} as read`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`[${client.id}] Mark as read failed: ${errorMessage}`);
      client.emit('chat:error', {
        message: errorMessage || 'Failed to mark chat as read',
      });
    }
  }

  // ========================= COLLAB EVENTS (for teammate) =========================
  // Placeholder for document collaboration events
  // Teammate will implement: collab:join, collab:update, collab:awareness

  /**
   * Placeholder for collab:join
   * Teammate implements document collaboration
   */
  @SubscribeMessage('collab:join')
  onCollabJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    this.logger.log(
      `[${client.id}] collab:join received (not yet implemented)`,
    );
    client.emit('collab:error', {
      message: 'Document collaboration not yet implemented',
    });
  }

  /**
   * Placeholder for collab:update
   * Teammate implements document updates
   */
  @SubscribeMessage('collab:update')
  onCollabUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    this.logger.debug(
      `[${client.id}] collab:update received (not yet implemented)`,
    );
  }
}
