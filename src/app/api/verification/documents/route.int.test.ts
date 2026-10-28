import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'ld_session' && mocks.token ? { name, value: mocks.token } : undefined,
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(),
}));

import { createSession } from '@/server/auth/session';
import { db } from '@/server/db';
import { resetAdaptersForTests as resetMail } from '@/server/mail';
import { getStorage, resetAdaptersForTests as resetStorage } from '@/server/storage';
import type { MemoryStorage } from '@/server/storage/memory';
import { fixtures } from '@/test/file-fixtures';
import { cleanupTestUsers, createTestUser, type TestUser } from '@/test/onboarding-fixtures';
import { DELETE, GET } from './[id]/route';
import { POST } from './route';

const tag = `rt${randomUUID().slice(0, 8)}`;
const URL_BASE = 'http://localhost:3000/api/verification/documents';
const MB = 1024 * 1024;

const useDriver = (driver: 's3' | 'memory') => {
  process.env.STORAGE_DRIVER = driver;
  resetStorage();
};

async function signIn(u: TestUser | null): Promise<void> {
  mocks.token = u ? (await createSession(u.id)).token : undefined;
}

function uploadRequest(
  fields: { type?: string; file?: { bytes: Buffer; name: string; mime?: string } },
  headers: Record<string, string> = {},
): Request {
  const form = new FormData();
  if (fields.type !== undefined) form.set('type', fields.type);
  if (fields.file) {
    const blob = new Blob([new Uint8Array(fields.file.bytes)], {
      type: fields.file.mime ?? 'application/pdf',
    });
    form.set('file', blob, fields.file.name);
  }
  return new Request(URL_BASE, { method: 'POST', body: form, headers });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const docCount = (u: TestUser) =>
  db.verificationDocument.count({ where: { verificationCaseId: u.caseId ?? '' } });

async function upload(u: TestUser, type = 'RUT'): Promise<string> {
  await signIn(u);
  const res = await POST(
    uploadRequest({ type, file: { bytes: fixtures.pdf(), name: 'soporte.pdf' } }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  process.env.MAIL_DRIVER = 'memory';
  resetMail();
});

beforeEach(() => useDriver('memory'));

afterAll(async () => {
  await cleanupTestUsers(tag);
  await db.$disconnect();
});

describe('POST /api/verification/documents', () => {
  it('uploads a valid PDF to RustFS and the owner reads it back through a 302 to a signed URL', async () => {
    useDriver('s3');
    const u = await createTestUser(tag, 'SELLER');
    await signIn(u);
    const bytes = fixtures.pdf();
    const res = await POST(
      uploadRequest({ type: 'NATIONAL_ID', file: { bytes, name: 'cedula.pdf' } }),
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const doc = await db.verificationDocument.findUniqueOrThrow({ where: { id } });
    try {
      expect(doc).toMatchObject({
        type: 'NATIONAL_ID',
        mime: 'application/pdf',
        size: bytes.length,
      });

      const read = await GET(new Request(`${URL_BASE}/${id}`), params(id));
      expect(read.status).toBe(302);
      expect(read.headers.get('cache-control')).toContain('no-store');
      const location = read.headers.get('location') ?? '';
      expect(location).toContain('X-Amz-Expires=60');
      const file = await fetch(location);
      expect(file.status).toBe(200);
      expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).toBe(true);
    } finally {
      await getStorage().delete(doc.storageKey);
    }
  });

  it('rejects an executable renamed to .pdf (declared application/pdf) with 422 and creates nothing', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await signIn(u);
    const objects = (getStorage() as MemoryStorage).objects.size;
    const res = await POST(
      uploadRequest({
        type: 'NATIONAL_ID',
        file: { bytes: fixtures.exe(), name: 'cedula.pdf', mime: 'application/pdf' },
      }),
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION');
    expect(await docCount(u)).toBe(0);
    expect((getStorage() as MemoryStorage).objects.size).toBe(objects);
  });

  it('rejects 11 MB with 422: early via content-length and again while reading the body', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await signIn(u);
    const big = { bytes: fixtures.pdfOfSize(11 * MB), name: 'grande.pdf' };

    const declaredReq = uploadRequest(
      { type: 'RUT', file: big },
      { 'content-length': String(11 * MB + 300) },
    );
    const declared = await POST(declaredReq);
    expect(declared.status).toBe(422);
    expect(declaredReq.bodyUsed).toBe(false);

    // No content-length header (e.g. chunked): the streaming cap still stops it.
    const undeclared = await POST(uploadRequest({ type: 'RUT', file: big }));
    expect(undeclared.status).toBe(422);
    expect(await docCount(u)).toBe(0);
  });

  it('rejects a missing file, a missing or unknown type and a non-multipart body with 422', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await signIn(u);
    const file = { bytes: fixtures.pdf(), name: 'a.pdf' };
    expect((await POST(uploadRequest({ type: 'RUT' }))).status).toBe(422);
    expect((await POST(uploadRequest({ file }))).status).toBe(422);
    expect((await POST(uploadRequest({ type: 'PASSPORT', file }))).status).toBe(422);
    const json = new Request(URL_BASE, {
      method: 'POST',
      body: JSON.stringify({ type: 'RUT' }),
      headers: { 'content-type': 'application/json' },
    });
    expect((await POST(json)).status).toBe(422);
    expect(await docCount(u)).toBe(0);
  });

  it('requires a session (401) and a BUYER/SELLER role (403)', async () => {
    await signIn(null);
    const file = { bytes: fixtures.pdf(), name: 'a.pdf' };
    expect((await POST(uploadRequest({ type: 'RUT', file }))).status).toBe(401);
    await signIn(await createTestUser(tag, 'BACKOFFICE', 'ENABLED'));
    expect((await POST(uploadRequest({ type: 'RUT', file }))).status).toBe(403);
  });

  it('is forbidden (403) once the user is IN_REVIEW', async () => {
    const u = await createTestUser(tag, 'SELLER', 'IN_REVIEW');
    await signIn(u);
    const res = await POST(
      uploadRequest({ type: 'RUT', file: { bytes: fixtures.pdf(), name: 'a.pdf' } }),
    );
    expect(res.status).toBe(403);
    expect(await docCount(u)).toBe(0);
  });
});

describe('GET /api/verification/documents/[id]', () => {
  it('another applicant gets 404 (existence is not revealed); an ENABLED BACKOFFICE gets the 302', async () => {
    const owner = await createTestUser(tag, 'SELLER');
    const id = await upload(owner);

    await signIn(await createTestUser(tag, 'BUYER'));
    const denied = await GET(new Request(`${URL_BASE}/${id}`), params(id));
    expect(denied.status).toBe(404);
    expect(denied.headers.get('location')).toBeNull();
    const unknown = await GET(new Request(`${URL_BASE}/nope`), params('nope'));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual(await denied.json());

    const bo = await createTestUser(tag, 'BACKOFFICE', 'ENABLED');
    await signIn(bo);
    const ok = await GET(new Request(`${URL_BASE}/${id}`), params(id));
    expect(ok.status).toBe(302);
    expect(ok.headers.get('location')).toMatch(/^memory:\/\/verification\//);
    const audit = await db.auditLog.findFirst({
      where: { action: 'VERIFICATION_DOCUMENT_VIEWED', entityId: id, actorId: bo.id },
    });
    expect(audit?.after).toEqual({ documentId: id, type: 'RUT' });
  });

  it('requires a session (401)', async () => {
    await signIn(null);
    expect((await GET(new Request(`${URL_BASE}/x`), params('x'))).status).toBe(401);
  });
});

describe('DELETE /api/verification/documents/[id]', () => {
  it("another applicant gets 404 on someone else's document; the owner gets 204", async () => {
    const owner = await createTestUser(tag, 'SELLER');
    const id = await upload(owner);

    await signIn(await createTestUser(tag, 'SELLER'));
    expect((await DELETE(new Request(`${URL_BASE}/${id}`), params(id))).status).toBe(404);
    expect(await db.verificationDocument.count({ where: { id } })).toBe(1);

    await signIn(owner);
    expect((await DELETE(new Request(`${URL_BASE}/${id}`), params(id))).status).toBe(204);
    expect(await db.verificationDocument.count({ where: { id } })).toBe(0);
  });

  it('is forbidden (403) once the owner is IN_REVIEW', async () => {
    const owner = await createTestUser(tag, 'SELLER');
    const id = await upload(owner);
    await db.user.update({ where: { id: owner.id }, data: { status: 'IN_REVIEW' } });
    await signIn(owner);
    expect((await DELETE(new Request(`${URL_BASE}/${id}`), params(id))).status).toBe(403);
    expect(await db.verificationDocument.count({ where: { id } })).toBe(1);
  });
});
