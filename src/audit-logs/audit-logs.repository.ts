import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte, SQL, sql } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { auditLogs } from 'src/db/schema/notifications';
import { users } from 'src/db/schema/user';
import {
  AuditLogCreateInput,
  AuditLogAction,
  AuditLogStats,
} from './types/audit-log.types';
import { GetAuditLogsQueryDto } from './dto/get-audit-logs-query.dto';

@Injectable()
export class AuditLogsRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  private buildConditions(query: GetAuditLogsQueryDto, includeCursor = true) {
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

    if (includeCursor && query.cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(query.cursor, 'base64').toString('utf-8'),
        );
        const cursorDate = new Date(decoded.createdAt);
        conditions.push(
          sql`(${auditLogs.createdAt} < ${cursorDate} OR (${auditLogs.createdAt} = ${cursorDate} AND ${auditLogs.id} < ${decoded.id}))`,
        );
      } catch (error) {
        // Invalid cursor, ignore
      }
    }

    return conditions;
  }

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
    const limit = (query.limit ?? 20) + 1; // +1 to detect if more items exist

    const conditions = this.buildConditions(query, true);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

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
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit);

    // Check if there are more items
    const hasMore = rows.length > (query.limit ?? 20);
    const items = hasMore ? rows.slice(0, -1) : rows;

    // Generate next cursor from last item
    let next: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      const cursorPayload = {
        createdAt: lastItem.createdAt?.toISOString(),
        id: lastItem.id,
      };
      next = Buffer.from(JSON.stringify(cursorPayload)).toString('base64');
    }

    return {
      items,
      next,
    };
  }

  async getAuditLogStats(query: GetAuditLogsQueryDto): Promise<AuditLogStats> {
    const conditions = this.buildConditions(query, false);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totals] = await this.drizzle.db
      .select({
        totalEvents: sql<number>`count(*)`,
        activeActors: sql<number>`count(distinct ${auditLogs.actorUserId})`,
        mostRecentActivity: sql<Date | null>`max(${auditLogs.createdAt})`,
      })
      .from(auditLogs)
      .where(where);

    const actionRows = await this.drizzle.db
      .select({
        action: auditLogs.action,
        count: sql<number>`count(*)`,
      })
      .from(auditLogs)
      .where(where)
      .groupBy(auditLogs.action);

    const topActionRow = actionRows
      .map((row) => ({ action: row.action, count: Number(row.count) }))
      .sort((left, right) => right.count - left.count)[0];

    return {
      totalEvents: Number(totals?.totalEvents ?? 0),
      activeActors: Number(totals?.activeActors ?? 0),
      topAction: topActionRow ?? null,
      mostRecentActivity: totals?.mostRecentActivity ?? null,
    };
  }
}
