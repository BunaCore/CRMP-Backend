/**
 * Presence-related types for real-time system
 */

/**
 * Presence status for a user
 */
export type PresenceStatus = 'online' | 'offline';

/**
 * Presence update event payload
 */
export interface PresenceUpdateEvent {
  userId: string;
  status: PresenceStatus;
  timestamp: Date;
}

/**
 * Presence sync event - sent to client on initial connection
 */
export interface PresenceSyncEvent {
  onlineUserIds: string[];
}

/**
 * Mark chat as read request payload
 */
export interface MarkChatAsReadEvent {
  chatId: string;
}
