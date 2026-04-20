/**
 * Sender info for messages
 */
export class SenderDto {
  id: string;
  name: string;
  avatar?: string | null;
}

/**
 * Single message with sender details
 * Used in REST API and Socket.IO messages
 */
export class MessageDto {
  id: string;
  chatId: string;
  content: string;
  createdAt: Date | null;
  sender: SenderDto;
}

/**
 * Paginated messages response
 */
export class ChatMessagesPageDto {
  messages: MessageDto[];
  nextCursor?: string | null; // ISO timestamp of last message, or null if no more
}
