import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersRepository } from 'src/users/users.repository';
import { CollaborationService } from './collaboration.service';
import { CollaborationPersistenceService } from './collaboration.persistence.service';
import type { CollabSocketData, CollabRoomName } from './types';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { CollaborationYjsDocService } from './yjs/collaboration-yjs-doc.service';

interface JwtPayload {
  sub: string;
  role?: string;
  iat?: number;
  exp?: number;
}

function extractJwt(raw?: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return trimmed.slice('bearer '.length).trim() || null;
  }
  return trimmed;
}

function safeJsonSizeBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function safeBinaryLengthBytes(value: unknown): number {
  if (value == null) return 0;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return 0;
}

const YJS_MESSAGE_SYNC = 0;
const YJS_MESSAGE_AWARENESS = 1;
const YJS_SYNC_STEP1 = 0;
const YJS_SYNC_STEP2 = 1;
const YJS_SYNC_UPDATE = 2;

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class CollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CollaborationGateway.name);

  // Presence tracking (single-instance): projectId -> (userId -> active socket count)
  private readonly activeByProject = new Map<string, Map<string, number>>();

  // Lightweight protections (avoid overengineering; keep defaults conservative)
  private readonly maxContentBytes = 1_000_000; // 1MB JSON payload cap
  private readonly maxBinaryBytes = 2_000_000; // 2MB Yjs message cap
  private readonly rateWindowMs = 5_000;
  private readonly rateMaxUpdatesPerWindow = 120;
  private readonly updateTimestampsBySocket = new Map<string, number[]>(); // socketId -> timestamps

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly collaborationService: CollaborationService,
    private readonly persistence: CollaborationPersistenceService,
    private readonly yjsDocs: CollaborationYjsDocService,
  ) {}

  async handleConnection(client: Socket) {
    const raw = client.handshake.headers['authorization'];
    const token = extractJwt(raw);
    if (!token) {
      client.emit('auth:error', { message: 'Missing token' });
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      }) as JwtPayload;

      const user = await this.usersRepository.findById(payload.sub);
      if (!user) {
        client.emit('auth:error', { message: 'User does not exist' });
        client.disconnect(true);
        return;
      }

      const data: CollabSocketData = {
        userId: payload.sub,
        role: payload.role,
      };
      client.data = data;

      this.logger.log(`[${client.id}] user ${payload.sub} connected (collab)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid token';
      client.emit('auth:error', { message: msg });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const data = client.data as CollabSocketData | undefined;
    this.updateTimestampsBySocket.delete(client.id);

    const projectId = data?.collab?.projectId;
    const userId = data?.userId;
    const workspaceId = data?.collab?.workspaceId;
    if (!projectId || !userId) return;

    // Best-effort: flush pending autosave for the project on disconnect.
    await this.persistence.flush(projectId);
    this.decrementPresence(projectId, userId);

    if (workspaceId) {
      this.yjsDocs.release(workspaceId);
    }
  }

  @SubscribeMessage('collab:join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { workspaceId?: string },
  ) {
    const data = client.data as CollabSocketData;
    const workspaceId = payload?.workspaceId;

    if (!data?.userId) {
      client.emit('collab:error', { message: 'Not authenticated' });
      return;
    }
    if (!workspaceId) {
      client.emit('collab:error', { message: 'workspaceId is required' });
      return;
    }

    try {
      const initial = await this.collaborationService.getInitialState({
        workspaceId,
        userId: data.userId,
      });

      // If already joined somewhere, leave first (prevents stale room membership).
      await this.leaveCurrentSession(client);

      const room: CollabRoomName = `collab:project:${initial.projectId}`;
      client.join(room);
      (client.data as CollabSocketData).collab = {
        projectId: initial.projectId,
        workspaceId,
        room,
      };

      this.incrementPresence(initial.projectId, data.userId);

      client.emit('collab:joined', {
        projectId: initial.projectId,
        workspaceId,
        document: initial.document,
        onlineUserIds: this.getOnlineUserIds(initial.projectId),
      });

      client.to(room).emit('collab:userJoined', {
        userId: data.userId,
        workspaceId,
        timestamp: new Date(),
      });

      // Presence snapshot/update for the whole room
      this.server.to(room).emit('collab:presence', {
        projectId: initial.projectId,
        onlineUserIds: this.getOnlineUserIds(initial.projectId),
        timestamp: new Date(),
      });

      // === Yjs sync bootstrap (true collaboration) ===
      // If the workspace has persisted yjs_state, it will be loaded into memory here.
      // If not, the document starts empty and the frontend must seed initial content.
      // (We still return the current REST snapshot in `collab:joined` for backward compat.)
      const entry = await this.yjsDocs.acquire(workspaceId);
      // Send sync step 1 to start protocol handshake.
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, YJS_MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(enc, entry.doc);
      client.emit('collab:yjs', encoding.toUint8Array(enc));

      this.logger.log(
        `[${client.id}] user ${data.userId} joined ${room} (workspace ${workspaceId})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to join';
      client.emit('collab:error', { message: msg });
    }
  }

  /**
   * True realtime collaboration transport (Yjs protocol messages).
   * Clients send binary messages, we apply them to the workspace Y.Doc and broadcast to teammates.
   *
   * Message envelope:
   * - varUint messageType (0=sync, 1=awareness)
   * - message payload (per y-protocols)
   */
  @SubscribeMessage('collab:yjs')
  async onYjsMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ArrayBuffer | Uint8Array,
  ) {
    const data = client.data as CollabSocketData;

    if (!data?.userId || !data?.collab) {
      client.emit('collab:error', { message: 'Not joined' });
      return;
    }

    const len = safeBinaryLengthBytes(payload);
    if (len <= 0 || len > this.maxBinaryBytes) {
      client.emit('collab:error', { message: 'Invalid yjs payload' });
      return;
    }
    if (!this.consumeUpdateQuota(client.id)) {
      client.emit('collab:error', { message: 'Rate limited' });
      return;
    }

    const { workspaceId, projectId, room } = data.collab;

    // Enforce project-scoped membership on every message (source of truth).
    try {
      await this.collaborationService.validateUpdateAccess({
        workspaceId,
        userId: data.userId,
        expectedProjectId: projectId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Access denied';
      client.emit('collab:error', { message: msg });
      return;
    }

    const entry = await this.yjsDocs.acquire(workspaceId);
    try {
      const buf =
        payload instanceof ArrayBuffer
          ? new Uint8Array(payload)
          : payload instanceof Uint8Array
            ? payload
            : new Uint8Array((payload as any).buffer ?? payload);

      // Peek types without consuming the decoder used by syncProtocol.
      const decPeek = decoding.createDecoder(buf);
      const messageType = decoding.readVarUint(decPeek);
      const syncType =
        messageType === YJS_MESSAGE_SYNC ? decoding.readVarUint(decPeek) : null;

      if (messageType === YJS_MESSAGE_SYNC) {
        const replyEnc = encoding.createEncoder();
        encoding.writeVarUint(replyEnc, YJS_MESSAGE_SYNC);

        const dec = decoding.createDecoder(buf);
        decoding.readVarUint(dec); // consume outer messageType

        // This reads sync messages and may write responses into replyEnc.
        // It also applies updates directly to the doc (triggering persistence scheduling).
        syncProtocol.readSyncMessage(dec, replyEnc, entry.doc, null);

        const reply = encoding.toUint8Array(replyEnc);
        // reply will always have at least the messageType; only send if payload exists.
        if (reply.length > 1) {
          client.emit('collab:yjs', reply);
        }

        // Only broadcast Yjs UPDATE messages to teammates.
        // Broadcasting step1/step2 (handshake) can confuse other clients.
        if (syncType === YJS_SYNC_UPDATE) {
          client.to(room).emit('collab:yjs', buf);
        }
      } else if (messageType === YJS_MESSAGE_AWARENESS) {
        const dec = decoding.createDecoder(buf);
        decoding.readVarUint(dec); // consume outer messageType
        // Remaining payload is an awareness update (binary)
        const update = decoding.readVarUint8Array(dec);
        awarenessProtocol.applyAwarenessUpdate(entry.awareness, update, client.id);
        client.to(room).emit('collab:yjs', buf);
      } else {
        client.emit('collab:error', { message: 'Unknown yjs message' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process yjs message';
      client.emit('collab:error', { message: msg });
    } finally {
      this.yjsDocs.release(workspaceId);
    }
  }

  @SubscribeMessage('collab:update')
  async onUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { workspaceId?: string; content?: unknown; clientUpdateId?: string },
  ) {
    const data = client.data as CollabSocketData;
    const workspaceId = payload?.workspaceId;
    const content = payload?.content;

    if (!data?.userId) {
      client.emit('collab:error', { message: 'Not authenticated' });
      return;
    }
    if (!data.collab) {
      client.emit('collab:error', { message: 'Not joined' });
      return;
    }
    if (!workspaceId || workspaceId !== data.collab.workspaceId) {
      client.emit('collab:error', { message: 'Invalid workspaceId' });
      return;
    }
    if (content === undefined || content === null) {
      client.emit('collab:error', { message: 'content is required' });
      return;
    }
    if (safeJsonSizeBytes(content) > this.maxContentBytes) {
      client.emit('collab:error', {
        message: `content too large (max ${this.maxContentBytes} bytes)`,
        clientUpdateId: payload?.clientUpdateId,
      });
      return;
    }

    if (!this.consumeUpdateQuota(client.id)) {
      client.emit('collab:error', {
        message: 'Rate limited',
        clientUpdateId: payload?.clientUpdateId,
      });
      return;
    }

    try {
      await this.collaborationService.validateUpdateAccess({
        workspaceId,
        userId: data.userId,
        expectedProjectId: data.collab.projectId,
      });

      // Debounced persistence to keep version history compatible:
      // - we autosave periodically (source_action='autosave')
      // - existing pruning logic keeps history manageable
      this.persistence.recordUpdate({
        projectId: data.collab.projectId,
        workspaceId,
        userId: data.userId,
        content,
      });

      // Broadcast update to other collaborators in the project room.
      client.to(data.collab.room).emit('collab:update', {
        workspaceId,
        userId: data.userId,
        content,
        clientUpdateId: payload?.clientUpdateId,
        timestamp: new Date(),
      });

      // Ack sender so frontend can reconcile optimistic updates if desired
      client.emit('collab:ack', {
        clientUpdateId: payload?.clientUpdateId,
        timestamp: new Date(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update rejected';
      client.emit('collab:error', {
        message: msg,
        clientUpdateId: payload?.clientUpdateId,
      });
    }
  }

  @SubscribeMessage('collab:leave')
  async onLeave(@ConnectedSocket() client: Socket) {
    await this.leaveCurrentSession(client);
    client.emit('collab:left', { timestamp: new Date() });
  }

  private getOnlineUserIds(projectId: string): string[] {
    const map = this.activeByProject.get(projectId);
    if (!map) return [];
    return Array.from(map.entries())
      .filter(([, count]) => count > 0)
      .map(([userId]) => userId);
  }

  private incrementPresence(projectId: string, userId: string) {
    if (!this.activeByProject.has(projectId)) {
      this.activeByProject.set(projectId, new Map());
    }
    const map = this.activeByProject.get(projectId)!;
    const next = (map.get(userId) ?? 0) + 1;
    map.set(userId, next);
    this.emitPresence(projectId);
  }

  private decrementPresence(projectId: string, userId: string) {
    const map = this.activeByProject.get(projectId);
    if (!map) return;
    const next = Math.max(0, (map.get(userId) ?? 0) - 1);
    if (next === 0) map.delete(userId);
    else map.set(userId, next);
    if (map.size === 0) this.activeByProject.delete(projectId);
    this.emitPresence(projectId);
  }

  private emitPresence(projectId: string) {
    this.server.to(`collab:project:${projectId}`).emit('collab:presence', {
      projectId,
      onlineUserIds: this.getOnlineUserIds(projectId),
      timestamp: new Date(),
    });
  }

  private async leaveCurrentSession(client: Socket) {
    const data = client.data as CollabSocketData | undefined;
    const projectId = data?.collab?.projectId;
    const userId = data?.userId;
    const room = data?.collab?.room;
    const workspaceId = data?.collab?.workspaceId;

    if (projectId && room) {
      client.leave(room);
      // Flush is project-scoped (1 workspace per project).
      await this.persistence.flush(projectId);
    }

    if (workspaceId) {
      this.yjsDocs.release(workspaceId);
    }

    if (projectId && userId) {
      this.decrementPresence(projectId, userId);
    }

    if (data?.collab) {
      delete (client.data as CollabSocketData).collab;
    }
  }

  private consumeUpdateQuota(socketId: string): boolean {
    const now = Date.now();
    const windowStart = now - this.rateWindowMs;
    const arr = this.updateTimestampsBySocket.get(socketId) ?? [];
    const next = arr.filter((t) => t >= windowStart);
    next.push(now);
    this.updateTimestampsBySocket.set(socketId, next);
    return next.length <= this.rateMaxUpdatesPerWindow;
  }
}

