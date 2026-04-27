export interface CollabSocketData {
  userId: string;
  role?: string;
  collab?: {
    projectId: string;
    workspaceId: string;
    room: string;
  };
}

export type CollabRoomName = `collab:project:${string}`;

