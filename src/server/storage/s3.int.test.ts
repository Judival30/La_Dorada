import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { env } from '@/server/env';
import { db } from '@/server/db';
import { getStorage, resetAdaptersForTests } from './index';

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  process.env.STORAGE_DRIVER = 's3';
  resetAdaptersForTests();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('S3 storage (RustFS)', () => {
  it('put + presignGet returns the same content; unsigned GET is denied', async () => {
    const storage = getStorage();
    const key = `verification/test-${randomUUID()}/${randomUUID()}`;
    const body = Buffer.from('contenido de prueba');
    await storage.put(key, body, 'application/pdf');
    try {
      const url = await storage.presignGet(key);
      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(Buffer.from(await res.arrayBuffer()).equals(body)).toBe(true);

      const anon = await fetch(`${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`);
      expect(anon.status).toBe(403);
    } finally {
      await storage.delete(key);
    }
  });

  it('presigned URL expires', async () => {
    const storage = getStorage();
    const key = `verification/test-${randomUUID()}/${randomUUID()}`;
    await storage.put(key, Buffer.from('x'), 'image/png');
    try {
      const url = await storage.presignGet(key, 1);
      await sleep(2500);
      expect((await fetch(url)).status).toBe(403);
    } finally {
      await storage.delete(key);
    }
  });

  it('delete removes the object', async () => {
    const storage = getStorage();
    const key = `verification/test-${randomUUID()}/${randomUUID()}`;
    await storage.put(key, Buffer.from('x'), 'image/png');
    await storage.delete(key);
    const res = await fetch(await storage.presignGet(key));
    expect(res.status).toBe(404);
  });
});
