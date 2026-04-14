import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { SaveDocumentDto } from './dto/save-document.dto';
import { ImportMarkdownDto } from './dto/import-markdown.dto';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CurrentUser, type AuthenticatedUser } from 'src/auth/decorators/current-user.decorator';
import { AccessService } from 'src/access-control/access.service';
import { RequirePermission } from 'src/access-control/require-permission.decorator';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly accessService: AccessService,
  ) {}

  // ─── Workspace CRUD ─────────────────────────────────────────────────

  @Post('project/:projectId')
  async createWorkspace(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateWorkspaceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.createWorkspace(projectId, dto, user.id);
  }

  @Get('project/:projectId')
  async getWorkspaces(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.documentsService.getWorkspaces(projectId);
  }

  // ─── Document operations ────────────────────────────────────────────

  @Get(':workspaceId/document')
  async getDocument(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.documentsService.getDocument(workspaceId);
  }

  @Put(':workspaceId/document')
  async saveDocument(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: SaveDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.saveDocument(workspaceId, dto, user.id);
  }

  // ─── Version history ────────────────────────────────────────────────

  @Get(':workspaceId/versions')
  async getVersions(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.documentsService.getVersions(workspaceId);
  }

  @Get(':workspaceId/versions/:versionId')
  async getVersionDetail(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.documentsService.getVersionDetail(workspaceId, versionId);
  }

  @Post(':workspaceId/versions/:versionId/restore')
  async restoreVersion(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.restoreVersion(workspaceId, versionId, user.id);
  }

  // ─── Import ─────────────────────────────────────────────────────────

  @Post(':workspaceId/import/markdown')
  async importMarkdown(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: ImportMarkdownDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.importMarkdown(workspaceId, dto, user.id);
  }

  // ─── Export ─────────────────────────────────────────────────────────

  /**
   * Returns markdown as JSON: { markdown, workspaceName }
   * Frontend can display it or trigger a download.
   */
  @Get(':workspaceId/export/markdown')
  async exportMarkdown(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('download') download?: string,
    @Res() res?: Response,
  ) {
    const { markdown, workspaceName } = await this.documentsService.exportMarkdown(workspaceId);

    // ?download=true → send as .md file attachment
    if (download === 'true' && res) {
      const safeName = workspaceName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'document';
      res.set({
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeName}.md"`,
      });
      res.send(markdown);
      return;
    }

    // Default: JSON response for frontend consumption
    if (res) {
      res.json({ markdown, workspaceName });
    }
  }

  /**
   * Streams a PDF binary to the client.
   */
  @Get(':workspaceId/export/pdf')
  async exportPdf(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.documentsService.exportPdf(workspaceId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}