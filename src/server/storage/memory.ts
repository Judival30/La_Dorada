import type { ObjectStorage, PresignGetOptions } from './index';

/** In-memory storage for unit tests (`STORAGE_DRIVER=memory`). */
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  /** Fake URL; overrides appear as `&type=` / `&disposition=` (URI-encoded) so tests can assert them. */
  async presignGet(key: string, ttlSeconds = 60, opts: PresignGetOptions = {}): Promise<string> {
    let url = `memory://${key}?ttl=${ttlSeconds}`;
    if (opts.contentType) url += `&type=${encodeURIComponent(opts.contentType)}`;
    if (opts.disposition) url += `&disposition=${encodeURIComponent(opts.disposition)}`;
    return url;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
