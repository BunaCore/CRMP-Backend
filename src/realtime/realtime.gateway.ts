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

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private chatService: ChatService,
  ) {}

  /**
   * Handle client connection
   * Verify JWT token from handshake auth
   */
  handleConnection(client: Socket) {
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

      // Attach user data to socket
      const socketData: SocketData = {
        userId: payload.sub,
        role: payload.role,
      };
      client.data = socketData;

      this.logger.log(
        `[${client.id}] User ${payload.sub} (role: ${payload.role}) connected`,
      );
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
      const messages = await this.chatService.joinChat(chatId, userId);

      // Join Socket.IO room
      client.join(`chat:${chatId}`);

      // Send message history
      client.emit('chat:history', messages);

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
   */
  @SubscribeMessage('chat:sendMessage')
  async onSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chatId: string; content: string },
  ) {
    const { userId } = client.data as SocketData;
    const { chatId, content } = payload;

    if (!chatId || !content) {
      client.emit('chat:error', {
        message: 'chatId and content are required',
      });
      return;
    }

    try {
      // Send message (validates membership internally)
      const message = await this.chatService.sendMessage(
        chatId,
        userId,
        content,
      );

      // Broadcast to all users in room (including sender)
      this.server.to(`chat:${chatId}`).emit('chat:message', message);

      this.logger.debug(
        `[${client.id}] User ${userId} sent message to chat ${chatId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`[${client.id}] Send message failed: ${errorMessage}`);
      client.emit('chat:error', {
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
