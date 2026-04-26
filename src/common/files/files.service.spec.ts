import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';
import { StorageService } from './storage/storage.interface';

describe('FilesService', () => {
  let service: FilesService;
  let filesRepository: jest.Mocked<FilesRepository>;
  let storageService: jest.Mocked<StorageService>;

  beforeEach(() => {
    filesRepository = {
      createFile: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      getTempFilesOlderThan: jest.fn(),
      attachToResource: jest.fn(),
    } as unknown as jest.Mocked<FilesRepository>;

    storageService = {
      getPresignedPutUrl: jest.fn(),
      getPresignedGetUrl: jest.fn(),
      headObject: jest.fn(),
      deleteObject: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          S3_BUCKET_PUBLIC: 'public-bucket',
          S3_BUCKET_PRIVATE: 'private-bucket',
          S3_PUBLIC_BASE_URL: 'https://cdn.example.com/public-bucket',
          S3_SIGNED_URL_EXPIRES_SECONDS: '900',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    service = new FilesService(filesRepository, configService, storageService);
  });

  it('creates public upload url for USER_AVATAR', async () => {
    filesRepository.createFile.mockResolvedValue({
      id: 'file-id',
      storagePath: 'uploads/user/file-id/avatar.png',
      bucket: 'public-bucket',
    } as any);
    storageService.getPresignedPutUrl.mockResolvedValue(
      'https://signed-upload-url',
    );

    const result = await service.initiateUpload(
      {
        originalName: 'avatar.png',
        mimeType: 'image/png',
        size: 2000,
        resourceType: 'USER_AVATAR',
      },
      'user-id',
    );

    expect(filesRepository.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'public-bucket',
        resourceType: 'USER_AVATAR',
      }),
    );
    expect(result.uploadUrl).toBe('https://signed-upload-url');
    expect(result.publicUrl).toContain('https://cdn.example.com/public-bucket/');
  });

  it('returns signed get url for private files', async () => {
    filesRepository.findById.mockResolvedValue({
      id: 'file-id',
      bucket: 'private-bucket',
      storagePath: 'uploads/u1/f1/private.pdf',
    } as any);
    storageService.getPresignedGetUrl.mockResolvedValue(
      'https://signed-download-url',
    );

    const result = await service.getFileById('file-id');

    expect(result).toEqual({
      fileId: 'file-id',
      url: 'https://signed-download-url',
      visibility: 'private',
      expiresIn: 900,
    });
  });

  it('returns direct url for public files', async () => {
    filesRepository.findById.mockResolvedValue({
      id: 'file-id',
      bucket: 'public-bucket',
      storagePath: 'uploads/u1/f1/avatar.png',
    } as any);

    const result = await service.getFileById('file-id');

    expect(result).toEqual({
      fileId: 'file-id',
      url: 'https://cdn.example.com/public-bucket/uploads/u1/f1/avatar.png',
      visibility: 'public',
    });
  });

  it('throws when bucket is missing on file', async () => {
    filesRepository.findById.mockResolvedValue({
      id: 'file-id',
      bucket: null,
      storagePath: 'uploads/u1/f1/doc.pdf',
    } as any);

    await expect(service.getFileById('file-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
