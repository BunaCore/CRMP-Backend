import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte, SQL, sql } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { auditLogs } from 'src/db/schema/notifications';
import { users } from 'src/db/schema/user';
import { AuditLogCreateInput, AuditLogAction } from './types/audit-log.types';
import { GetAuditLogsQueryDto } from './dto/get-audit-logs-query.dto';

@Injectable()
export class AuditLogsRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async insertAuditLog(input: AuditLogCreateInput) {
    const [log] = await this.drizzle.db
      .insert(auditLogs)
      .values({
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? null,
      })
      .returning();

    return log;
  }

  async findAuditLogs(query: GetAuditLogsQueryDto) {
    const conditions: SQL<unknown>[] = [];

    if (query.actorUserId) {
      conditions.push(eq(auditLogs.actorUserId, query.actorUserId));
    }

    if (query.entityType) {
      conditions.push(eq(auditLogs.entityType, query.entityType));
    }

    if (query.entityId) {
      conditions.push(eq(auditLogs.entityId, query.entityId));
    }

    if (query.action) {
      conditions.push(eq(auditLogs.action, query.action as AuditLogAction));
    }

    if (query.from) {
      conditions.push(gte(auditLogs.createdAt, query.from));
    }

    if (query.to) {
      conditions.push(lte(auditLogs.createdAt, query.to));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const [countRow] = await this.drizzle.db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(where);

    const rows = await this.drizzle.db
      .select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        actorFullName: users.fullName,
        actorEmail: users.email,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items: rows,
      totalItems: countRow?.total ?? 0,
    };
  }
}
