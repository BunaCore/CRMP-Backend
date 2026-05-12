import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ProjectsService } from 'src/projects/projects.service';
import { TasksRepository } from './tasks.repository';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { eq, count } from 'drizzle-orm';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly repo: TasksRepository,
    private readonly projectsService: ProjectsService,
    private readonly drizzle: DrizzleService,
  ) {}

  // ─── Guard: throw 403 if user is not a project member ─────────────────────
  private async assertMember(userId: string, projectId: string): Promise<void> {
    const isMember = await this.projectsService.isUserMemberOfProject(
      userId,
      projectId,
    );
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this project');
    }
  }

  // ─── Guard: validate assignee belongs to the same project ─────────────────
  private async assertAssigneeMember(
    assigneeId: string,
    projectId: string,
  ): Promise<void> {
    const isMember = await this.projectsService.isUserMemberOfProject(
      assigneeId,
      projectId,
    );
    if (!isMember) {
      throw new BadRequestException(
        'Assignee must be a member of this project',
      );
    }
  }

  // ─── List tasks ───────────────────────────────────────────────────────────
  async getTasksByProject(
    userId: string,
    projectId: string,
    filters: { status?: string; priority?: string; assigneeId?: string },
  ) {
    await this.assertMember(userId, projectId);
    const tasks = await this.repo.findTasksByProject(projectId, filters);
    return { tasks };
  }

  // ─── Get single task ──────────────────────────────────────────────────────
  async getTaskById(userId: string, taskId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task) throw new NotFoundException('Task not found');
    await this.assertMember(userId, task.projectId);
    return { task };
  }

  // ─── Create task ──────────────────────────────────────────────────────────
  async createTask(userId: string, projectId: string, dto: CreateTaskDto) {
    await this.assertMember(userId, projectId);

    if (dto.assigneeId) {
      await this.assertAssigneeMember(dto.assigneeId, projectId);
    }

    // Generate taskCode atomically inside a transaction to prevent race conditions
    const taskRow = await this.drizzle.transaction(async (tx) => {
      const [{ total }] = await tx
        .select({ total: count() })
        .from(schema.tasks)
        .where(eq(schema.tasks.projectId, projectId));

      const taskCode = `TASK-${String(Number(total) + 1).padStart(3, '0')}`;

      const [inserted] = await tx
        .insert(schema.tasks)
        .values({
          taskCode,
          projectId,
          title: dto.title,
          description: dto.description ?? null,
          status: (dto.status ?? 'todo') as any,
          priority: (dto.priority ?? 'medium') as any,
          assigneeId: dto.assigneeId ?? null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          createdBy: userId,
        })
        .returning();

      return inserted;
    });

    // Write creation activity
    await this.repo.createActivity({
      taskId: taskRow.id,
      projectId,
      userId,
      action: 'created',
    });

    const task = await this.repo.findTaskById(taskRow.id);
    return { task };
  }

  // ─── Update task ──────────────────────────────────────────────────────────
  async updateTask(userId: string, taskId: string, dto: UpdateTaskDto) {
    const existing = await this.repo.findTaskById(taskId);
    if (!existing) throw new NotFoundException('Task not found');
    await this.assertMember(userId, existing.projectId);

    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      await this.assertAssigneeMember(dto.assigneeId, existing.projectId);
    }

    const updatePayload: Record<string, any> = {};
    if (dto.title !== undefined) updatePayload.title = dto.title;
    if (dto.description !== undefined) updatePayload.description = dto.description;
    if (dto.priority !== undefined) updatePayload.priority = dto.priority;
    if (dto.assigneeId !== undefined) updatePayload.assigneeId = dto.assigneeId;
    if (dto.dueDate !== undefined) {
      updatePayload.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.status !== undefined) updatePayload.status = dto.status;

    await this.repo.updateTask(taskId, updatePayload);

    // Write tracked activity records
    const activities: Promise<void>[] = [];

    if (dto.status && dto.status !== existing.status) {
      activities.push(
        this.repo.createActivity({
          taskId,
          projectId: existing.projectId,
          userId,
          action: 'status_changed',
          detail: `${existing.status} → ${dto.status}`,
        }),
      );
    }

    if (dto.priority && dto.priority !== existing.priority) {
      activities.push(
        this.repo.createActivity({
          taskId,
          projectId: existing.projectId,
          userId,
          action: 'priority_changed',
          detail: `${existing.priority} → ${dto.priority}`,
        }),
      );
    }

    if (dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId) {
      activities.push(
        this.repo.createActivity({
          taskId,
          projectId: existing.projectId,
          userId,
          action: 'assigned',
          detail: dto.assigneeId ? 'Assignee changed' : 'Assignee removed',
        }),
      );
    }

    await Promise.all(activities);

    const task = await this.repo.findTaskById(taskId);
    return { task };
  }

  // ─── Delete task (only creator can delete) ────────────────────────────────
  async deleteTask(userId: string, taskId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task) throw new NotFoundException('Task not found');
    await this.assertMember(userId, task.projectId);

    const [raw] = await this.drizzle.db
      .select({ createdBy: schema.tasks.createdBy })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId))
      .limit(1);

    if (raw?.createdBy && raw.createdBy !== userId) {
      throw new ForbiddenException('Only the task creator can delete this task');
    }

    await this.repo.deleteTask(taskId);
    return { message: 'Task deleted successfully' };
  }

  // ─── Get project members ──────────────────────────────────────────────────
  async getProjectMembers(userId: string, projectId: string) {
    await this.assertMember(userId, projectId);
    const members = await this.repo.getProjectMembers(projectId);
    return { members };
  }

  // ─── Get summary ──────────────────────────────────────────────────────────
  async getSummary(userId: string, projectId: string) {
    await this.assertMember(userId, projectId);

    const [statusCounts, workload, velocity, deadlines, recentActivity] =
      await Promise.all([
        this.repo.getTaskCountsByStatus(projectId),
        this.repo.getMemberWorkload(projectId),
        this.repo.getVelocityData(projectId),
        this.repo.getUpcomingDeadlines(projectId),
        this.repo.getRecentActivity(projectId, 10),
      ]);

    const countMap: Record<string, number> = {};
    statusCounts.forEach(({ status, count }) => {
      countMap[status] = count;
    });

    const totalTasks = Object.values(countMap).reduce((a, b) => a + b, 0);

    return {
      summary: {
        totalTasks,
        inProgress: countMap['in_progress'] ?? 0,
        completed: countMap['done'] ?? 0,
        blocked: countMap['review'] ?? 0,
        velocity,
        teamWorkload: workload,
        recentActivity,
        upcomingDeadlines: deadlines,
      },
    };
  }

  // ─── Get task activity ────────────────────────────────────────────────────
  async getTaskActivity(userId: string, taskId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task) throw new NotFoundException('Task not found');
    await this.assertMember(userId, task.projectId);
    const activity = await this.repo.getTaskActivity(taskId);
    return { activity };
  }

  // ─── Add comment ──────────────────────────────────────────────────────────
  async addComment(userId: string, taskId: string, dto: CreateCommentDto) {
    const task = await this.repo.findTaskById(taskId);
    if (!task) throw new NotFoundException('Task not found');
    await this.assertMember(userId, task.projectId);

    // Store comment text in task_comments
    await this.repo.createComment({
      taskId,
      userId,
      content: dto.comment,
      projectId: task.projectId,
    });

    // Store activity with the comment text in `detail` — this is what the feed displays
    await this.repo.createActivity({
      taskId,
      projectId: task.projectId,
      userId,
      action: 'commented',
      detail: dto.comment,   // ← the actual comment text
    });

    // Return the latest activity entry for this task (activity-shaped, not comment-shaped)
    const activity = await this.repo.getTaskActivity(taskId);
    const activityItem = activity[0]; // most recent = the one just inserted
    return { activityItem };
  }

  // ─── Get comments ─────────────────────────────────────────────────────────
  async getComments(userId: string, taskId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task) throw new NotFoundException('Task not found');
    await this.assertMember(userId, task.projectId);
    const comments = await this.repo.findCommentsByTask(taskId);
    return { comments };
  }
}
