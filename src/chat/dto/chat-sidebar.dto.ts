/**
 * Last message in a chat (simplified for sidebar)
 */
export class LastMessageDto {
  id: string;
  content: string;
  createdAt: Date;
  senderName: string;
}

/**
 * Chat item for sidebar list
 * Includes unread count and last message
 */
export class ChatSidebarItemDto {
  id: string;
  type: 'dm' | 'group';
  displayName: string;
  displayImage?: string | null;
  unreadCount: number;
  lastMessage?: LastMessageDto | null;
}
