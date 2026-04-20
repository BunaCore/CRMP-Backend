/**
 * Sender info in last message
 */
export class LastMessageSenderDto {
  id: string;
  name: string;
  avatar?: string | null;
}

/**
 * Last message in a chat (with full sender info for UI consistency)
 */
export class LastMessageDto {
  id: string;
  chatId: string;
  content: string;
  createdAt: Date;
  sender: LastMessageSenderDto;
}

/**
 * Chat item for sidebar list
 * Optimized as a view model for UI (not a DB model)
 * - displayImage: other user's avatar for DM, chat image for group
 * - unreadCount: messages created after lastReadAt
 * - lastMessage: full message with sender for consistent UI rendering
 * - otherMemberId (DM only): for presence indicator (online/offline)
 * - memberIds (group only): for computing online count
 */
export class ChatSidebarItemDto {
  id: string;
  type: 'dm' | 'group';
  displayName: string;
  displayImage?: string | null;
  unreadCount: number;
  lastMessage?: LastMessageDto | null;
  otherMemberId?: string | null; // For DMs - needed for presence indicator
  memberIds?: string[]; // For groups - needed for online count
}
