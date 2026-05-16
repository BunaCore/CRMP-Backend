import { AuditActionValue } from './audit-action.enum';

export type AuditLogAction = AuditActionValue;

export type AuditLogItem = {
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

export type AuditLogCreateInput = {
  actorUserId?: string | null;
  action: AuditLogAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, any> | null;
};

export type AuditLogStats = {
  totalEvents: number;
  activeActors: number;
  topAction: { action: AuditLogAction; count: number } | null;
  mostRecentActivity: Date | null;
};
