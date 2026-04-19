/**
 * Member info in a chat
 */
export class ChatMemberDto {
  id: string;
  name: string;
  email?: string;
}

/**
 * Detailed chat response (for GET /chats/:id)
 * Includes all members
 */
export class ChatDetailDto {
  id: string;
  type: 'dm' | 'group';
  name?: string | null; // null for DMs
  members: ChatMemberDto[];
  createdAt: Date | null;
}
