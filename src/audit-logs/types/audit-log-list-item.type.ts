import { AuditLogAction } from './audit-log.types';

export type AuditLogListItem = {
  id: string;
  actorUserId: string | null;
  actorFullName: string | null;
  actorEmail: string | null;
  action: AuditLogAction;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date | null;
};
