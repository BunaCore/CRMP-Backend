import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { DocumentsRepository } from './documents.repository';
import { DrizzleService } from 'src/db/db.service';
import { TiptapValidator } from './tiptap-validator.service';
import { TiptapRenderer } from './tiptap-renderer.service';
import { MarkdownConverter } from './markdown-converter.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let repository: DocumentsRepository;

  const mockRepository = {
    findDocumentByWorkspaceId: jest.fn(),
    findWorkspaceById: jest.fn(),
    findLatestVersionByDocumentId: jest.fn(),
    getNextVersionNumber: jest.fn(),
    createDocumentVersion: jest.fn(),
    updateDocument: jest.fn(),
    findVersionById: jest.fn(),
    findVersionsByDocumentId: jest.fn(),
  };

  const mockDrizzle = {
    transaction: jest.fn((cb: any) => cb(mockDrizzle)),
  };

  const mockValidator = {
    validateDocument: jest.fn((content: any) => content),
  };

  const mockRenderer = {
    renderToPdf: jest.fn(),
  };

  const mockMarkdownConverter = {
    markdownToTiptap: jest.fn(),
    tiptapToMarkdown: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset validator to passthrough by default
    mockValidator.validateDocument.mockImplementation((content: any) => content);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: DocumentsRepository, useValue: mockRepository },
        { provide: DrizzleService, useValue: mockDrizzle },
        { provide: TiptapValidator, useValue: mockValidator },
        { provide: TiptapRenderer, useValue: mockRenderer },
        { provide: MarkdownConverter, useValue: mockMarkdownConverter },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    repository = module.get<DocumentsRepository>(DocumentsRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveDocument', () => {
    it('should validate content before saving', async () => {
      const dto = { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'test' }] }] } };
      const document = { id: 'doc-id', workspaceId: 'ws-id', currentContent: dto.content };

      mockRepository.findDocumentByWorkspaceId.mockResolvedValue(document);
      mockRepository.findLatestVersionByDocumentId.mockResolvedValue(null);
      mockRepository.getNextVersionNumber.mockResolvedValue(2);
      mockRepository.createDocumentVersion.mockResolvedValue({
        id: 'v-id', versionNumber: 2, createdAt: new Date(), createdBy: 'user-id', sourceAction: 'save', contentHash: 'hash',
      });
      mockRepository.updateDocument.mockResolvedValue(document);

      await service.saveDocument('ws-id', dto, 'user-id');

      expect(mockValidator.validateDocument).toHaveBeenCalledWith(dto.content);
    });

    it('should throw if validation fails', async () => {
      const dto = { content: { type: 'invalid' } };
      mockValidator.validateDocument.mockImplementation(() => {
        throw new BadRequestException('Invalid document');
      });

      await expect(service.saveDocument('ws-id', dto, 'user-id')).rejects.toThrow(BadRequestException);
    });

    it('should skip version if content unchanged', async () => {
      const dto = { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'same' }] }] } };
      const document = { id: 'doc-id', workspaceId: 'ws-id', currentContent: dto.content };
      const hash = service['computeHash'](dto.content);

      mockRepository.findDocumentByWorkspaceId.mockResolvedValue(document);
      mockRepository.findLatestVersionByDocumentId.mockResolvedValue({ contentHash: hash });
      mockRepository.updateDocument.mockResolvedValue(document);

      const result = await service.saveDocument('ws-id', dto, 'user-id');

      expect(result.newVersion).toBeNull();
      expect(mockRepository.createDocumentVersion).not.toHaveBeenCalled();
    });
  });

  describe('exportMarkdown', () => {
    it('should return markdown with workspace name', async () => {
      mockRepository.findWorkspaceById.mockResolvedValue({ id: 'ws-id', name: 'My Doc' });
      mockRepository.findDocumentByWorkspaceId.mockResolvedValue({
        id: 'doc-id',
        currentContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] },
      });
      mockMarkdownConverter.tiptapToMarkdown.mockReturnValue('hi');

      const result = await service.exportMarkdown('ws-id');

      expect(result).toEqual({ markdown: 'hi', workspaceName: 'My Doc' });
    });

    it('should throw if workspace not found', async () => {
      mockRepository.findWorkspaceById.mockResolvedValue(null);

      await expect(service.exportMarkdown('ws-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportPdf', () => {
    it('should return buffer with sanitized filename', async () => {
      const buf = Buffer.from('pdf-data');
      mockRepository.findWorkspaceById.mockResolvedValue({ id: 'ws-id', name: 'My Report (Final)' });
      mockRepository.findDocumentByWorkspaceId.mockResolvedValue({ id: 'doc-id', currentContent: { type: 'doc', content: [] } });
      mockRenderer.renderToPdf.mockResolvedValue(buf);

      const result = await service.exportPdf('ws-id');

      expect(result.filename).toBe('My Report Final.pdf');
      expect(result.buffer).toBe(buf);
    });

    it('should handle table rendering in PDF export', async () => {
      const tableDoc = {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    attrs: { colspan: 1, rowspan: 1 },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header 1' }] }]
                  },
                  {
                    type: 'tableHeader',
                    attrs: { colspan: 1, rowspan: 1 },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header 2' }] }]
                  }
                ]
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    attrs: { colspan: 1, rowspan: 1 },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] }]
                  },
                  {
                    type: 'tableCell',
                    attrs: { colspan: 1, rowspan: 1 },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 2' }] }]
                  }
                ]
              }
            ]
          }
        ]
      };
      const buf = Buffer.from('pdf-data');
      mockRepository.findWorkspaceById.mockResolvedValue({ id: 'ws-id', name: 'Table Test' });
      mockRepository.findDocumentByWorkspaceId.mockResolvedValue({ id: 'doc-id', currentContent: tableDoc });
      mockRenderer.renderToPdf.mockResolvedValue(buf);

      const result = await service.exportPdf('ws-id');

      expect(mockRenderer.renderToPdf).toHaveBeenCalledWith(tableDoc, 'Table Test');
      expect(result.buffer).toBe(buf);
    });
  });

  describe('importMarkdown', () => {
    it('should convert markdown to tiptap and save', async () => {
      const tiptapDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] };
      const document = { id: 'doc-id', workspaceId: 'ws-id', currentContent: { type: 'doc', content: [] } };

      mockRepository.findDocumentByWorkspaceId.mockResolvedValue(document);
      mockMarkdownConverter.markdownToTiptap.mockReturnValue(tiptapDoc);
      mockRepository.findLatestVersionByDocumentId.mockResolvedValue(null);
      mockRepository.getNextVersionNumber.mockResolvedValue(2);
      mockRepository.createDocumentVersion.mockResolvedValue({
        id: 'v-id', versionNumber: 2, createdAt: new Date(), createdBy: 'user-id', sourceAction: 'import', contentHash: 'h',
      });
      mockRepository.updateDocument.mockResolvedValue({ ...document, currentContent: tiptapDoc });

      const result = await service.importMarkdown('ws-id', { markdown: '# hello' }, 'user-id');

      expect(mockMarkdownConverter.markdownToTiptap).toHaveBeenCalledWith('# hello');
      expect(result.newVersion).toBeTruthy();
    });
  });

  describe('restoreVersion', () => {
    it('should create new version if content differs', async () => {
      const document = { id: 'doc-id', workspaceId: 'ws-id', currentContent: { type: 'doc', content: [] } };
      const version = { id: 'v-id', documentId: 'doc-id', content: { type: 'doc', content: [{ type: 'text', text: 'older' }] }, contentHash: 'old-hash' };
      
      mockRepository.findDocumentByWorkspaceId.mockResolvedValue(document);
      mockRepository.findVersionById.mockResolvedValue(version);
      mockRepository.getNextVersionNumber.mockResolvedValue(3);
      mockRepository.createDocumentVersion.mockResolvedValue({
        id: 'new-v-id', versionNumber: 3, createdAt: new Date(), createdBy: 'user-id', sourceAction: 'restore', contentHash: 'old-hash'
      });
      mockRepository.updateDocument.mockResolvedValue({ ...document, currentContent: version.content });

      // Override computeHash for the document currentContent to be different from version's hash
      jest.spyOn(service as any, 'computeHash').mockReturnValueOnce('current-hash');

      const result = await service.restoreVersion('ws-id', 'v-id', 'user-id');
      expect(mockRepository.createDocumentVersion).toHaveBeenCalledWith(
        'doc-id', 3, version.content, 'user-id', 'restore', 'old-hash'
      );
      expect(result.newVersion).toBeTruthy();
    });

    it('should skip restore if already at that content', async () => {
      const content = { type: 'doc', content: [{ type: 'text', text: 'same' }] };
      const hash = service['computeHash'](content);
      const document = { id: 'doc-id', workspaceId: 'ws-id', currentContent: content };
      const version = { id: 'v-id', documentId: 'doc-id', content, contentHash: hash };

      mockRepository.findDocumentByWorkspaceId.mockResolvedValue(document);
      mockRepository.findVersionById.mockResolvedValue(version);

      const result = await service.restoreVersion('ws-id', 'v-id', 'user-id');
      expect(result.newVersion).toBeNull();
      expect(mockRepository.createDocumentVersion).not.toHaveBeenCalled();
    });
  });

  describe('Retrieving Versions', () => {
    it('getVersions should return list of mapped versions', async () => {
      mockRepository.findDocumentByWorkspaceId.mockResolvedValue({ id: 'doc-id' });
      mockRepository.findVersionsByDocumentId.mockResolvedValue([
        { id: 'v1', versionNumber: 1, createdAt: new Date(), createdBy: 'u1', sourceAction: 'save', contentHash: 'h1' }
      ]);

      const res = await service.getVersions('ws-id');
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('v1');
    });

    it('getVersionDetail should return specific version with content', async () => {
      mockRepository.findDocumentByWorkspaceId.mockResolvedValue({ id: 'doc-id' });
      mockRepository.findVersionById.mockResolvedValue({
         id: 'v1', documentId: 'doc-id', versionNumber: 1, createdAt: new Date(), createdBy: 'u1', sourceAction: 'save', contentHash: 'h1', content: {}
      });

      const res = await service.getVersionDetail('ws-id', 'v1');
      expect(res.id).toBe('v1');
      expect(res.content).toBeDefined();
    });
  });
});