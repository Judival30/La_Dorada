import { getDriverEnv } from '@/server/env';
import { MemoryStorage } from './memory';
import { S3Storage } from './s3';

/** Response header overrides baked into a signed GET URL. */
export type PresignGetOptions = {
  /** Sent as `ResponseContentType` (the response's Content-Type). */
  contentType?: string;
  /** Sent as `ResponseContentDisposition`, e.g. `inline` or `attachment; filename="x.pdf"`. */
  disposition?: string;
};

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Short-lived signed GET URL (default 60 s). */
  presignGet(key: string, ttlSeconds?: number, opts?: PresignGetOptions): Promise<string>;
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
