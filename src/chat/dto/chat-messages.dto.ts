/**
 * Sender info for messages
 */
export class SenderDto {
  id: string;
  name: string;
  avatar?: string | null;
}

/**
 * Single message with sender detailsCursor-based pagination
 */
export class MessageDto {
  id: string;
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
