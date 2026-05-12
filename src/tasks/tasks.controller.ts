import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from 'src/auth/decorators/current-user.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // ─── GET /projects/:projectId/tasks ───────────────────────────────────────
  @Get('projects/:projectId/tasks')
  async getTasks(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
  ) {
    return this.tasksService.getTasksByProject(user.id, projectId, {
      status,
      priority,
      assigneeId,
    });
  }

  // ─── GET /projects/:projectId/tasks/summary ───────────────────────────────
  @Get('projects/:projectId/tasks/summary')
  async getSummary(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.getSummary(user.id, projectId);
  }

  // ─── GET /projects/:projectId/tasks/members ───────────────────────────────
  // Returns enriched member list (initials, color, avatarUrl) for task assignee picker
  @Get('projects/:projectId/tasks/members')
  async getMembers(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.getProjectMembers(user.id, projectId);
  }

  // ─── POST /projects/:projectId/tasks ──────────────────────────────────────
  @Post('projects/:projectId/tasks')
  async createTask(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.createTask(user.id, projectId, dto);
  }

  // ─── GET /tasks/:taskId ───────────────────────────────────────────────────
  @Get('tasks/:taskId')
  async getTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.getTaskById(user.id, taskId);
  }

  // ─── PATCH /tasks/:taskId ─────────────────────────────────────────────────
  @Patch('tasks/:taskId')
  async updateTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(user.id, taskId, dto);
  }

  // ─── DELETE /tasks/:taskId ────────────────────────────────────────────────
  @Delete('tasks/:taskId')
  async deleteTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.deleteTask(user.id, taskId);
  }

  // ─── GET /tasks/:taskId/activity ─────────────────────────────────────────
  @Get('tasks/:taskId/activity')
  async getActivity(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.getTaskActivity(user.id, taskId);
  }

  // ─── GET /tasks/:taskId/comments ─────────────────────────────────────────
  @Get('tasks/:taskId/comments')
  async getComments(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.getComments(user.id, taskId);
  }

  // ─── POST /tasks/:taskId/comments ────────────────────────────────────────
  @Post('tasks/:taskId/comments')
  async addComment(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.tasksService.addComment(user.id, taskId, dto);
  }
}
