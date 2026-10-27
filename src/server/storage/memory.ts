import type { ObjectStorage } from './index';

/** In-memory storage for unit tests (`STORAGE_DRIVER=memory`). */
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async presignGet(key: string, ttlSeconds = 60): Promise<string> {
    return `memory://${key}?ttl=${ttlSeconds}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
