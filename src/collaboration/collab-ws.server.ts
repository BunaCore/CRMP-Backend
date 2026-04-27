/**
 * collab-ws.server.ts
 *
 * Attaches a raw y-websocket server to the NestJS HTTP server at /collab/*.
 *
 * Frontend contract (y-websocket WebsocketProvider):
 *   - Connects to: ws://<host>/collab/<workspaceId>?token=<jwt>
 *   - Room name:   workspaceId (URL path segment after /collab/)
 *   - Auth:        JWT as ?token= query param
 *   - Protocol:    y-websocket binary (y-protocols sync + awareness)
 *   - Doc binding: ydoc.getXmlFragment("document") [client-side; server syncs full Y.Doc]
 *
 * Auth failure response:
 *   HTTP 401 / 403 before WebSocket upgrade — frontend sees a disconnect and
 *   the 8-second SYNC_TIMEOUT_MS in useCollabProvider degrades gracefully to solo mode.
 *
 * Persistence:
 *   - bindState: loads documents.yjs_state (bytea) from Postgres, applies to Y.Doc
 *   - writeState: saves Y.Doc state back to Postgres (called when last client leaves)
 *   - Debounced 2-second write on every doc update while clients are connected
 *
 * Redis: NOT used for collaboration. State is in-process + Postgres only.
 */

import * as http from 'http';
import { URL } from 'url';
import * as WebSocket from 'ws';
import * as Y from 'yjs';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CollaborationYjsRepository } from './yjs/collaboration-yjs.repository';
import { WorkspaceAccessService } from 'src/documents/workspace-access.service';

// y-websocket's bin/utils exports the following in v3.x:
//   setupWSConnection(conn, req, opts?)  — handles y-protocols sync for one client
//   setPersistence(persistence)          — MODULE-LEVEL: must be called ONCE before any connection
//
// IMPORTANT: 'persistence' is a module-level setting in y-websocket, not per-connection.
// The option must be set via setPersistence() before the first client connects.
// Passing it inside setupWSConnection opts is silently ignored by the library.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ywsUtils = require('y-websocket/bin/utils') as {
  setupWSConnection: (
    conn: WebSocket,
    req: http.IncomingMessage,
    opts?: { docName?: string; gc?: boolean },
  ) => void;
  setPersistence: (persistence: {
    bindState: (docName: string, doc: Y.Doc) => void | Promise<void>;
    writeState: (docName: string, doc: Y.Doc) => void | Promise<void>;
  }) => void;
};

/**
 * Builds the Postgres-backed persistence adapter for y-websocket.
 * Called once and registered via setPersistence before any client connects.
 */
function buildPersistence(
  repo: CollaborationYjsRepository,
  logger: Logger,
) {
  return {
    /**
     * Called by y-websocket when a new doc is first opened (first client joins).
     * Loads the stored Yjs binary state from documents.yjs_state and applies it.
     * Also schedules debounced DB writes on every subsequent doc update.
     */
    async bindState(workspaceId: string, doc: Y.Doc) {
      try {
        const state = await repo.getYjsStateByWorkspaceId(workspaceId);
        if (state && state.length > 0) {
          Y.applyUpdate(doc, state);
          logger.debug(
            `[collab-ws] Loaded yjs_state for workspace ${workspaceId} (${state.length} bytes)`,
          );
        } else {
          logger.debug(
            `[collab-ws] No persisted yjs_state for workspace ${workspaceId} — starting fresh`,
          );
        }
      } catch (err) {
        logger.error(
          `[collab-ws] Failed to load yjs_state for ${workspaceId}: ${err}`,
        );
      }

      // Debounced write: persist 2 seconds after the last update to avoid DB hammering.
      let flushTimeout: NodeJS.Timeout | null = null;
      doc.on('update', () => {
        if (flushTimeout) clearTimeout(flushTimeout);
        flushTimeout = setTimeout(() => {
          void repo
            .setYjsStateByWorkspaceId(workspaceId, Y.encodeStateAsUpdate(doc))
            .catch((err) =>
              logger.error(
                `[collab-ws] Failed debounced yjs_state write for ${workspaceId}: ${err}`,
              ),
            );
        }, 2000);
      });
    },

    /**
     * Called by y-websocket when the last client disconnects from the doc.
     * Performs a final synchronous flush to Postgres.
     */
    async writeState(workspaceId: string, doc: Y.Doc) {
      try {
        await repo.setYjsStateByWorkspaceId(
          workspaceId,
          Y.encodeStateAsUpdate(doc),
        );
        logger.debug(
          `[collab-ws] Flushed yjs_state for workspace ${workspaceId} (last client left)`,
        );
      } catch (err) {
        logger.error(
          `[collab-ws] Failed final yjs_state flush for ${workspaceId}: ${err}`,
        );
      }
    },
  };
}

/**
 * Attaches the y-websocket raw WS server to the NestJS HTTP server.
 *
 * Call this after NestFactory.create() (so httpServer exists) and before
 * app.listen() (so the 'upgrade' event listener is registered before the
 * first client arrives). Using app.init() + app.listen() split in main.ts
 * guarantees this ordering.
 *
 * Socket.IO handles upgrades for /socket.io/* — this handler intercepts
 * /collab/* only. The two paths never overlap.
 */
export function attachCollabWsServer(
  httpServer: http.Server,
  jwtService: JwtService,
  jwtSecret: string,
  yjsRepo: CollaborationYjsRepository,
  workspaceAccess: WorkspaceAccessService,
): void {
  const logger = new Logger('CollabWsServer');

  // Register module-level persistence ONCE before any connection is accepted.
  // y-websocket's setupWSConnection reads this global when creating a new Y.Doc.
  ywsUtils.setPersistence(buildPersistence(yjsRepo, logger));

  // noServer: true — we handle the HTTP upgrade manually to auth before upgrading.
  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on('upgrade', (request: http.IncomingMessage, socket, head) => {
    const rawUrl = request.url ?? '/';

    // Only intercept /collab/* — leave /socket.io/* and all other paths alone.
    if (!rawUrl.startsWith('/collab')) return;

    void (async () => {
      try {
        const urlObj = new URL(rawUrl, 'http://localhost');
        const pathname = urlObj.pathname; // e.g. /collab/<workspaceId>

        // Extract workspaceId: strip /collab/ prefix and URL-decode.
        // WebsocketProvider sends: ws://host/collab/${encodeURIComponent(workspaceId)}
        const workspaceId = decodeURIComponent(
          pathname.replace(/^\/collab\/?/, '').trim(),
        );

        if (!workspaceId) {
          logger.warn('[collab-ws] Rejected upgrade: missing workspaceId in path');
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }

        // ── Auth: read JWT from ?token= query param ───────────────────────
        // Frontend sends: params: { token } via WebsocketProvider options.
        // This translates to ?token=<jwt> appended to the WS URL.
        const token = urlObj.searchParams.get('token');
        if (!token) {
          logger.warn(
            `[collab-ws] Rejected upgrade: no token for workspace ${workspaceId}`,
          );
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        let userId: string;
        try {
          const payload = jwtService.verify(token, { secret: jwtSecret }) as {
            sub: string;
          };
          userId = payload.sub;
        } catch {
          logger.warn(
            `[collab-ws] Rejected upgrade: invalid/expired token for workspace ${workspaceId}`,
          );
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // ── Membership: user must belong to the project that owns this workspace ──
        // WorkspaceAccessService.ensureWorkspaceMember:
        //   1. Resolves workspace → projectId
        //   2. Checks projectMembers table: userId ∈ project
        //   3. Throws NotFoundException if either fails
        // Non-members receive HTTP 403 — frontend sees WebSocket close →
        // SYNC_TIMEOUT_MS (8 s) triggers solo-mode fallback.
        try {
          await workspaceAccess.ensureWorkspaceMember({ workspaceId, userId });
        } catch {
          logger.warn(
            `[collab-ws] Rejected upgrade: user ${userId} is not a member of workspace ${workspaceId}`,
          );
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }

        // ── Upgrade accepted: hand off to y-websocket ─────────────────────
        // setupWSConnection handles the full y-protocols sync/awareness handshake:
        //   - Creates or retrieves the in-memory Y.Doc for workspaceId (= docName)
        //   - Calls persistence.bindState on first open (loads Postgres state)
        //   - Handles sync step 1 / step 2 / update messages
        //   - Broadcasts updates to all clients sharing the same docName
        //   - Handles awareness updates (peer presence)
        //   - Calls persistence.writeState when the last client disconnects
        wss.handleUpgrade(request, socket, head, (ws) => {
          logger.log(
            `[collab-ws] user ${userId} joined workspace ${workspaceId}`,
          );
          ywsUtils.setupWSConnection(ws as any, request, {
            docName: workspaceId, // room name = workspaceId (matches frontend)
            gc: true,
          });
        });
      } catch (err) {
        logger.error(`[collab-ws] Unexpected upgrade error: ${err}`);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
    })();
  });

  logger.log('[collab-ws] y-websocket server attached at ws://<host>/collab/*');
}
