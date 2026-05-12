import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import {
  eq,
  and,
  sql,
  gte,
  lte,
  desc,
  count,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

// ─── Helper: derive initials from a full name ───────────────────────────────
function toInitials(name: string | null | undefined): string {
  if (!name) return '??';
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0].toUpperCase())
    .join('')
    .slice(0, 2);
}

// ─── Helper: deterministic color from userId ────────────────────────────────
const COLOR_PALETTE = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
];

function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

@Injectable()
export class TasksRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  // ─── aliases for double-joining users table ────────────────────────────────
  private get assigneeAlias() {
    return alias(schema.users, 'assignee');
  }

  private get creatorAlias() {
    return alias(schema.users, 'creator');
  }

  // ─── Shape a raw DB row into the canonical Task response object ────────────
  private shapeTask(row: {
    task: typeof schema.tasks.$inferSelect;
    assignee: { id: string | null; fullName: string | null; avatarUrl: string | null } | null;
  }) {
    const { task, assignee } = row;
    return {
      id: task.id,
      taskCode: task.taskCode,
      projectId: task.projectId,
      title: task.title,
      description: task.description ?? null,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId ?? null,
      assigneeName: assignee?.fullName ?? null,
      assigneeInitials: assignee?.fullName ? toInitials(assignee.fullName) : null,
      assigneeAvatarUrl: assignee?.avatarUrl ?? null,
      dueDate: task.dueDate ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  // ─── Count tasks in a project (used for taskCode generation) ──────────────
  async countTasksByProject(projectId: string): Promise<number> {
    const [row] = await this.drizzle.db
      .select({ total: count() })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId));
    return row?.total ?? 0;
  }

  // ─── List tasks by project with optional filters ───────────────────────────
  async findTasksByProject(
    projectId: string,
    filters: {
      status?: string;
      priority?: string;
      assigneeId?: string;
    } = {},
  ) {
    const assignee = this.assigneeAlias;

    const conditions = [eq(schema.tasks.projectId, projectId)];
    if (filters.status) {
      conditions.push(eq(schema.tasks.status, filters.status as any));
    }
    if (filters.priority) {
      conditions.push(eq(schema.tasks.priority, filters.priority as any));
    }
    if (filters.assigneeId) {
      conditions.push(eq(schema.tasks.assigneeId, filters.assigneeId));
    }

    const rows = await this.drizzle.db
      .select({
        task: schema.tasks,
        assignee: {
          id: assignee.id,
          fullName: assignee.fullName,
          avatarUrl: assignee.avatarUrl,
        },
      })
      .from(schema.tasks)
      .leftJoin(assignee, eq(schema.tasks.assigneeId, assignee.id))
      .where(and(...conditions))
      .orderBy(schema.tasks.createdAt);

    return rows.map((r) => this.shapeTask(r));
  }

  // ─── Get single task by id ─────────────────────────────────────────────────
  async findTaskById(taskId: string) {
    const assignee = this.assigneeAlias;

    const [row] = await this.drizzle.db
      .select({
        task: schema.tasks,
        assignee: {
          id: assignee.id,
          fullName: assignee.fullName,
          avatarUrl: assignee.avatarUrl,
        },
      })
      .from(schema.tasks)
      .leftJoin(assignee, eq(schema.tasks.assigneeId, assignee.id))
      .where(eq(schema.tasks.id, taskId));

    return row ? this.shapeTask(row) : undefined;
  }

  // ─── Create task ───────────────────────────────────────────────────────────
  async createTask(data: {
    taskCode: string;
    projectId: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    assigneeId?: string;
    dueDate?: Date;
    createdBy: string;
  }) {
    const [inserted] = await this.drizzle.db
      .insert(schema.tasks)
      .values({
        taskCode: data.taskCode,
        projectId: data.projectId,
        title: data.title,
        description: data.description ?? null,
        status: data.status as any,
        priority: data.priority as any,
        assigneeId: data.assigneeId ?? null,
        dueDate: data.dueDate ?? null,
        createdBy: data.createdBy,
      })
      .returning();
    return inserted;
  }

  // ─── Update task ───────────────────────────────────────────────────────────
  async updateTask(
    taskId: string,
    data: Partial<{
      title: string;
      description: string | null;
      status: string;
      priority: string;
      assigneeId: string | null;
      dueDate: Date | null;
    }>,
  ) {
    const [updated] = await this.drizzle.db
      .update(schema.tasks)
      .set({
        ...data,
        status: data.status as any,
        priority: data.priority as any,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, taskId))
      .returning();
    return updated;
  }

  // ─── Delete task ───────────────────────────────────────────────────────────
  async deleteTask(taskId: string): Promise<void> {
    await this.drizzle.db
      .delete(schema.tasks)
      .where(eq(schema.tasks.id, taskId));
  }

  // ─── Get project members (with avatarUrl) ──────────────────────────────────
  async getProjectMembers(projectId: string) {
    const rows = await this.drizzle.db
      .select({
        id: schema.users.id,
        fullName: schema.users.fullName,
        avatarUrl: schema.users.avatarUrl,
        role: schema.projectMembers.role,
      })
      .from(schema.projectMembers)
      .innerJoin(
        schema.users,
        eq(schema.projectMembers.userId, schema.users.id),
      )
      .where(eq(schema.projectMembers.projectId, projectId))
      .orderBy(schema.projectMembers.addedAt);

    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName ?? 'Unknown',
      initials: toInitials(r.fullName),
      avatarUrl: r.avatarUrl ?? null,
      color: userColor(r.id),
      role: r.role,
    }));
  }

  // ─── Summary: grouped counts by status ────────────────────────────────────
  async getTaskCountsByStatus(
    projectId: string,
  ): Promise<{ status: string; count: number }[]> {
    const rows = await this.drizzle.db
      .select({
        status: schema.tasks.status,
        count: count(),
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId))
      .groupBy(schema.tasks.status);
    return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
  }

  // ─── Summary: per-member workload ─────────────────────────────────────────
  async getMemberWorkload(projectId: string) {
    // Active (non-done) task count per assignee in this project
    const rows = await this.drizzle.db
      .select({
        userId: schema.tasks.assigneeId,
        activeTasks: count(),
      })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.projectId, projectId),
          sql`${schema.tasks.status} != 'done'`,
          sql`${schema.tasks.assigneeId} IS NOT NULL`,
        ),
      )
      .groupBy(schema.tasks.assigneeId);

    // Done task count per assignee
    const doneRows = await this.drizzle.db
      .select({
        userId: schema.tasks.assigneeId,
        doneTasks: count(),
      })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.projectId, projectId),
          eq(schema.tasks.status, 'done'),
          sql`${schema.tasks.assigneeId} IS NOT NULL`,
        ),
      )
      .groupBy(schema.tasks.assigneeId);

    // User info for those assignees
    const assigneeIds = [
      ...new Set([
        ...rows.map((r) => r.userId),
        ...doneRows.map((r) => r.userId),
      ]),
    ].filter(Boolean) as string[];

    if (assigneeIds.length === 0) return [];

    const userRows = await this.drizzle.db
      .select({
        id: schema.users.id,
        fullName: schema.users.fullName,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.users)
      .where(sql`${schema.users.id} = ANY(${assigneeIds})`);

    return userRows.map((u) => {
      const active = Number(
        rows.find((r) => r.userId === u.id)?.activeTasks ?? 0,
      );
      const done = Number(
        doneRows.find((r) => r.userId === u.id)?.doneTasks ?? 0,
      );
      const total = active + done;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;
      return {
        memberId: u.id,
        name: u.fullName ?? 'Unknown',
        initials: toInitials(u.fullName),
        avatarUrl: u.avatarUrl ?? null,
        color: userColor(u.id),
        activeTasks: active,
        progress,
      };
    });
  }

  // ─── Summary: velocity — tasks completed per day for last 14 days ──────────
  async getVelocityData(projectId: string): Promise<number[]> {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // Fetch all tasks moved to 'done' in the last 14 days
    const doneTasks = await this.drizzle.db
      .select({ updatedAt: schema.tasks.updatedAt })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.projectId, projectId),
          eq(schema.tasks.status, 'done'),
          gte(schema.tasks.updatedAt, fourteenDaysAgo),
        ),
      );

    // Build a 14-element array: count tasks completed on each of the last 14 days
    const today = new Date();
    const result: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0]; // 'YYYY-MM-DD'
      const dayCount = doneTasks.filter((t) => {
        if (!t.updatedAt) return false;
        return t.updatedAt.toISOString().split('T')[0] === dayStr;
      }).length;
      result.push(dayCount);
    }
    return result;
  }

  // ─── Summary: upcoming deadlines (next 7 days) ─────────────────────────────
  async getUpcomingDeadlines(projectId: string) {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return this.drizzle.db
      .select({
        taskId: schema.tasks.id,
        taskCode: schema.tasks.taskCode,
        title: schema.tasks.title,
        dueDate: schema.tasks.dueDate,
        priority: schema.tasks.priority,
      })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.projectId, projectId),
          sql`${schema.tasks.dueDate} IS NOT NULL`,
          gte(schema.tasks.dueDate, now),
          lte(schema.tasks.dueDate, weekFromNow),
          sql`${schema.tasks.status} != 'done'`,
        ),
      )
      .orderBy(schema.tasks.dueDate);
  }

  // ─── Activity: get recent activity for a project ───────────────────────────
  async getRecentActivity(projectId: string, limit = 10) {
    const rows = await this.drizzle.db
      .select({
        activity: schema.taskActivity,
        taskCode: schema.tasks.taskCode,
        userName: schema.users.fullName,
        userAvatar: schema.users.avatarUrl,
      })
      .from(schema.taskActivity)
      .innerJoin(schema.tasks, eq(schema.taskActivity.taskId, schema.tasks.id))
      .leftJoin(schema.users, eq(schema.taskActivity.userId, schema.users.id))
      .where(eq(schema.taskActivity.projectId, projectId))
      .orderBy(desc(schema.taskActivity.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.activity.id,
      taskId: r.activity.taskId,
      taskCode: r.taskCode,
      userId: r.activity.userId ?? null,
      user: r.userName ?? 'Unknown',
      initials: toInitials(r.userName),
      avatarUrl: r.userAvatar ?? null,
      action: r.activity.action,
      detail: r.activity.detail ?? null,
      time: r.activity.createdAt,
    }));
  }

  // ─── Activity: get activity for a specific task ────────────────────────────
  async getTaskActivity(taskId: string) {
    const task = await this.drizzle.db
      .select({ projectId: schema.tasks.projectId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId))
      .limit(1);

    if (!task[0]) return [];

    const rows = await this.drizzle.db
      .select({
        activity: schema.taskActivity,
        taskCode: schema.tasks.taskCode,
        userName: schema.users.fullName,
        userAvatar: schema.users.avatarUrl,
      })
      .from(schema.taskActivity)
      .innerJoin(schema.tasks, eq(schema.taskActivity.taskId, schema.tasks.id))
      .leftJoin(schema.users, eq(schema.taskActivity.userId, schema.users.id))
      .where(eq(schema.taskActivity.taskId, taskId))
      .orderBy(desc(schema.taskActivity.createdAt));

    return rows.map((r) => ({
      id: r.activity.id,
      taskId: r.activity.taskId,
      taskCode: r.taskCode,
      userId: r.activity.userId ?? null,
      user: r.userName ?? 'Unknown',
      initials: toInitials(r.userName),
      avatarUrl: r.userAvatar ?? null,
      action: r.activity.action,
      detail: r.activity.detail ?? null,
      time: r.activity.createdAt,
    }));
  }

  // ─── Activity: insert a record ─────────────────────────────────────────────
  async createActivity(data: {
    taskId: string;
    projectId: string;
    userId: string;
    action: string;
    detail?: string;
  }): Promise<void> {
    await this.drizzle.db.insert(schema.taskActivity).values({
      taskId: data.taskId,
      projectId: data.projectId,
      userId: data.userId,
      action: data.action,
      detail: data.detail ?? null,
    });
  }

  // ─── Comments: get all for a task ─────────────────────────────────────────
  async findCommentsByTask(taskId: string) {
    const rows = await this.drizzle.db
      .select({
        comment: schema.taskComments,
        userName: schema.users.fullName,
        userAvatar: schema.users.avatarUrl,
      })
      .from(schema.taskComments)
      .leftJoin(
        schema.users,
        eq(schema.taskComments.userId, schema.users.id),
      )
      .where(eq(schema.taskComments.taskId, taskId))
      .orderBy(schema.taskComments.createdAt);

    return rows.map((r) => ({
      id: r.comment.id,
      taskId: r.comment.taskId,
      userId: r.comment.userId ?? null,
      user: r.userName ?? 'Unknown',
      initials: toInitials(r.userName),
      avatarUrl: r.userAvatar ?? null,
      content: r.comment.content,
      createdAt: r.comment.createdAt,
    }));
  }

  // ─── Comments: insert ──────────────────────────────────────────────────────
  async createComment(data: {
    taskId: string;
    userId: string;
    content: string;
    projectId: string;
  }) {
    const [inserted] = await this.drizzle.db
      .insert(schema.taskComments)
      .values({
        taskId: data.taskId,
        userId: data.userId,
        content: data.content,
      })
      .returning();

    return inserted;
  }
}
