import { getDriverEnv } from '@/server/env';
import { MemoryStorage } from './memory';
import { S3Storage } from './s3';

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Short-lived signed GET URL (default 60 s). */
  presignGet(key: string, ttlSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

let storage: ObjectStorage | undefined;

/** Memoized singleton chosen by `STORAGE_DRIVER` (`s3` by default, `memory` in unit tests). */
export function getStorage(): ObjectStorage {
  storage ??= getDriverEnv().STORAGE_DRIVER === 'memory' ? new MemoryStorage() : new S3Storage();
  return storage;
}

/** Drops memoized adapters so the next `get*()` re-reads the driver env vars. */
export function resetAdaptersForTests(): void {
  storage = undefined;
}
