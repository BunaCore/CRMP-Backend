export type PresignedPutInput = {
  bucket: string;
  key: string;
  contentType: string;
  expiresInSeconds: number;
};

export type PresignedGetInput = {
  bucket: string;
  key: string;
  expiresInSeconds: number;
};

export interface StorageService {
  getPresignedPutUrl(input: PresignedPutInput): Promise<string>;
  getPresignedGetUrl(input: PresignedGetInput): Promise<string>;
  headObject(bucket: string, key: string): Promise<void>;
  deleteObject(bucket: string, key: string): Promise<void>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
