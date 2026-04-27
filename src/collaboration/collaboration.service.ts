import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { DocumentsService } from 'src/documents/documents.service';
import { WorkspaceAccessService } from 'src/documents/workspace-access.service';

@Injectable()
export class CollaborationService {
  private readonly logger = new Logger(CollaborationService.name);

  constructor(
    private readonly documentsService: DocumentsService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async getInitialState(params: { workspaceId: string; userId: string }) {
    const { projectId } = await this.workspaceAccess.ensureWorkspaceMember({
      workspaceId: params.workspaceId,
      userId: params.userId,
    });

    const doc = await this.documentsService.getDocument(
      params.workspaceId,
      params.userId,
    );

    return {
      projectId,
      workspaceId: params.workspaceId,
      document: doc,
    };
  }

  async validateUpdateAccess(params: {
    workspaceId: string;
    userId: string;
    expectedProjectId: string;
  }): Promise<{ projectId: string }> {
    const { projectId } = await this.workspaceAccess.ensureWorkspaceMember({
      workspaceId: params.workspaceId,
      userId: params.userId,
    });
    if (projectId !== params.expectedProjectId) {
      this.logger.warn(
        `Workspace ${params.workspaceId} project mismatch. expected=${params.expectedProjectId} actual=${projectId}`,
      );
      throw new ForbiddenException('Invalid workspace');
    }

    return { projectId };
  }
}

