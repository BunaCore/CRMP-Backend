import { chats, chatMembers, messages } from 'src/db/schema/chat';

/**
 * Chat entity interface - represents a chat room
 * Can be either a group (project-based) or DM (1:1 between users)
 */
export interface Chat {
  id: string;
  type: 'group' | 'dm';
  name: string | null; // Only for group chats
  projectId: string | null; // Only for group chats
  createdBy: string;
  createdAt: Date | null; // Allow null from DB
}

/**
 * Chat member interface - tracks who is in a chat
 */
export interface ChatMember {
  chatId: string;
  userId: string;
  joinedAt: Date | null;
}

/**
 * Message interface - represents a single chat message
 */
export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  createdAt: Date | null; // Allow null from DB
}

/**
 * Sender info in messages (for client responses)
 */
export interface MessageSender {
  id: string;
  name: string;
  avatar?: string | null;
}

/**
 * Extended message with sender info (for REST and Socket responses)
 * Used by both API endpoints and Socket.IO gates
 */
export interface MessageWithSender extends Message {
  sender: MessageSender;
}

/**
 * Chat member detail for API responses
 */
export interface ChatMemberDetail {
  id: string;
  fullName: string;
  email: string;
}

/**
 * Chat with all members (for detail endpoints)
 */
export interface ChatWithMembers {
  id: string;
  type: 'group' | 'dm';
  name: string | null;
  createdAt: Date | null;
  members: ChatMemberDetail[];
}

/**
 * Input for creating a chat
 */
export interface CreateChatInput {
  type: 'group' | 'dm';
  name?: string | null;
  projectId?: string | null;
  createdBy: string;
}

/**
 * Chat with last message (for sidebar queries)
 * View model optimized for REST response
 */
export interface ChatWithLastMessage {
  chatId: string;
  chatType: 'group' | 'dm';
  chatName: string | null;
  lastReadAt: Date;
  _lastMessageId: string | null;
  _lastMessageContent: string | null;
  _lastMessageCreatedAt: Date | null;
  _lastMessageSenderId: string | null;
  _lastMessageSenderName: string | null;
  _lastMessageSenderAvatar: string | null;
  _unreadCount: number;
  _otherUserId?: string | null; // For DMs only - other participant
  _otherUserName?: string | null; // For DMs only
  _otherUserAvatar?: string | null; // For DMs only
  _memberIds?: string[]; // For groups only - all member IDs for presence computation
}
