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

import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors';
import { GET } from '@/app/api/documents/[id]/route';
import { createSession, type SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { resetAdaptersForTests as resetMail } from '@/server/mail';
import { resetAdaptersForTests as resetStorage } from '@/server/storage';
import { cleanupTestUsers, createTestUser } from '@/test/onboarding-fixtures';
import { seed } from '../../../prisma/seed';
import {
  decideAccess,
  getAccessState,
  listAccessRequests,
  listConfidentiality,
  requestAccess,
  revokeAccess,
  signNda,
} from './access';
import { getDataRoom } from './data-room';

const tag = `acc${randomUUID().slice(0, 8)}`;
const DAY = 86_400_000;
const PURPOSE = 'Fondo interesado en alimentos de valor agregado y en su expansión regional.';
const CTX = { ip: '10.0.0.1', userAgent: 'vitest' };

const useDriver = (driver: 's3' | 'memory') => {
  process.env.STORAGE_DRIVER = driver;
  resetStorage();
};

const session = async (id: string): Promise<SessionUser> => {
  const row = await db.user.findUniqueOrThrow({ where: { id } });
  return { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status };
};

async function signIn(u: { id: string } | null): Promise<void> {
  mocks.token = u ? (await createSession(u.id)).token : undefined;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const download = (id: string) =>
  GET(new Request(`http://localhost:3000/api/documents/${id}`), params(id));

let oppId: string;
let docId: string;
let seller: SessionUser;
let bo: SessionUser;

async function newBuyer(): Promise<SessionUser> {
  return session((await createTestUser(tag, 'BUYER', 'ENABLED')).id);
}

const deniedCount = (documentId: string) =>
  db.auditLog.count({
    where: { action: 'ACCESS_DENIED', after: { path: ['documentId'], equals: documentId } },
  });

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  process.env.MAIL_DRIVER = 'memory';
  resetMail();
  useDriver('memory');
  await seed(db);

  const opp = await db.opportunity.findFirstOrThrow({
    where: { company: { slug: 'cafes-de-antioquia' } },
  });
  oppId = opp.id;
  seller = await session(opp.sellerId);
  const doc = await db.document.findFirstOrThrow({ where: { opportunityId: oppId } });
  docId = doc.id;
  bo = await session((await createTestUser(tag, 'BACKOFFICE', 'ENABLED')).id);
});

beforeEach(() => useDriver('memory'));

afterAll(async () => {
  const users = await db.user.findMany({
    where: { email: { contains: tag } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const requests = await db.accessRequest.findMany({
    where: { buyerId: { in: ids } },
    select: { id: true },
  });
  if (requests.length > 0) {
    await db.notification.deleteMany({
      where: {
        OR: requests.map((r) => ({ payload: { path: ['accessRequestId'], equals: r.id } })),
      },
    });
  }
  await db.ndaSignature.deleteMany({ where: { accessRequest: { buyerId: { in: ids } } } });
  await db.accessRequest.deleteMany({ where: { buyerId: { in: ids } } });
  await cleanupTestUsers(tag);
  await db.$disconnect();
});

describe('GET /api/documents/[id] (R2)', () => {
  it('a buyer without access gets 404 and an ACCESS_DENIED row', async () => {
    const buyer = await newBuyer();
    const before = await deniedCount(docId);
    await signIn(buyer);
    const res = await download(docId);
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
    expect(await deniedCount(docId)).toBe(before + 1);
    const row = await db.auditLog.findFirstOrThrow({
      where: { action: 'ACCESS_DENIED', actorId: buyer.id },
      orderBy: { seq: 'desc' },
    });
    expect(row.after).toEqual({ documentId: docId, opportunityId: oppId });
  });

  it('an unknown document id is also 404 (indistinguishable)', async () => {
    await signIn(await newBuyer());
    expect((await download('does-not-exist')).status).toBe(404);
  });

  it('a buyer with NDA_SIGNED but not authorized gets 404', async () => {
    const buyer = await newBuyer();
    const { id } = await requestAccess(buyer, oppId, { purpose: PURPOSE });
    await signNda(buyer, id, CTX);
    expect((await db.accessRequest.findUniqueOrThrow({ where: { id } })).status).toBe('NDA_SIGNED');
    await signIn(buyer);
    expect((await download(docId)).status).toBe(404);
    await expect(getDataRoom(buyer, oppId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('an expired NDA gets 404 even when AUTHORIZED', async () => {
    const buyer = await newBuyer();
    const past = new Date(Date.now() - 400 * DAY);
    const { id } = await requestAccess(buyer, oppId, { purpose: PURPOSE });
    await signNda(buyer, id, CTX, past);
    await decideAccess(seller, id, 'APPROVE', past);
    expect((await db.accessRequest.findUniqueOrThrow({ where: { id } })).status).toBe('AUTHORIZED');
    await signIn(buyer);
    expect((await download(docId)).status).toBe(404);
    const state = await getAccessState(buyer, oppId);
    expect(state.nda?.state).toBe('EXPIRED');
    expect(state.canOpenDataRoom).toBe(false);
  });

  it('a revoked access gets 404', async () => {
    const buyer = await newBuyer();
    const { id } = await requestAccess(buyer, oppId, { purpose: PURPOSE });
    await signNda(buyer, id, CTX);
    await decideAccess(seller, id, 'APPROVE');
    await signIn(buyer);
    expect((await download(docId)).status).toBe(302);
    await revokeAccess(seller, id);
    expect((await download(docId)).status).toBe(404);
  });

  it('an authorized buyer gets a 302 to a 60 s signed URL, audited', async () => {
    useDriver('s3');
    const buyer = await db.user.findUniqueOrThrow({
      where: { email: 'comprador@demo.ladorada.co' },
    });
    await signIn(buyer);
    const res = await download(docId);
    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('X-Amz-Signature');
    expect(location).toContain('X-Amz-Expires=60');
    expect(location).toContain('response-content-disposition=attachment');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'DOCUMENT_DOWNLOADED', actorId: buyer.id },
      orderBy: { seq: 'desc' },
    });
    expect(audit.after).toEqual({ documentId: docId, opportunityId: oppId });
  });

  it('the owner seller and Back Office may download; another seller may not', async () => {
    await signIn(seller);
    expect((await download(docId)).status).toBe(302);
    await signIn(bo);
    expect((await download(docId)).status).toBe(302);
    await signIn(await session((await createTestUser(tag, 'SELLER', 'ENABLED')).id));
    expect((await download(docId)).status).toBe(404);
  });

  it('no session → 401', async () => {
    await signIn(null);
    expect((await download(docId)).status).toBe(401);
  });
});

describe('access flow', () => {
  it('the seller cannot request access to their own opportunity (R9)', async () => {
    await expect(requestAccess(seller, oppId, { purpose: PURPOSE })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('validates the purpose (20–500) and refuses a second request', async () => {
    const buyer = await newBuyer();
    await expect(requestAccess(buyer, oppId, { purpose: 'corto' })).rejects.toThrow();
    await requestAccess(buyer, oppId, { purpose: PURPOSE });
    await expect(requestAccess(buyer, oppId, { purpose: PURPOSE })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('request → sign → approve → data room lists folders, notifying each side', async () => {
    const buyer = await newBuyer();
    const { id } = await requestAccess(buyer, oppId, { purpose: PURPOSE });
    const req = await db.accessRequest.findUniqueOrThrow({ where: { id } });
    expect(req.status).toBe('REQUESTED');
    expect(req.relevance).toBeGreaterThanOrEqual(0);
    expect(req.relevance).toBeLessThanOrEqual(100);
    expect(
      await db.notification.count({ where: { userId: seller.id, kind: 'ACCESS_REQUESTED' } }),
    ).toBeGreaterThan(0);

    await signNda(buyer, id, CTX);
    const sig = await db.ndaSignature.findFirstOrThrow({ where: { accessRequestId: id } });
    expect(sig.documentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sig.ip).toBe(CTX.ip);
    expect(sig.userAgent).toBe(CTX.userAgent);
    const days = (sig.expiresAt.getTime() - sig.signedAt.getTime()) / DAY;
    expect(days).toBe(365);

    const pending = await listAccessRequests(seller, 'PENDING');
    const row = pending.items.find((r) => r.id === id);
    expect(row).toMatchObject({ status: 'NDA_SIGNED', ndaState: 'SIGNED', canApprove: true });
    expect(pending.counts.PENDING).toBeGreaterThanOrEqual(1);

    await decideAccess(seller, id, 'APPROVE');
    expect(
      await db.notification.count({ where: { userId: buyer.id, kind: 'ACCESS_APPROVED' } }),
    ).toBe(1);

    const room = await getDataRoom(buyer, oppId);
    expect(room.folders.length).toBeGreaterThan(0);
    expect(room.folders.some((f) => f.documents.length > 0)).toBe(true);
    const json = JSON.stringify(room);
    expect(json).not.toContain('storageKey');
    expect(json).not.toContain('dataroom/');

    const audits = await db.auditLog.findMany({
      where: { entity: 'AccessRequest', entityId: id },
      orderBy: { seq: 'asc' },
      select: { action: true },
    });
    expect(audits.map((a) => a.action)).toEqual([
      'ACCESS_REQUESTED',
      'NDA_SIGNED',
      'ACCESS_APPROVED',
    ]);
  });

  it('approve requires a signed NDA; reject works before signing', async () => {
    const buyer = await newBuyer();
    const { id } = await requestAccess(buyer, oppId, { purpose: PURPOSE });
    await expect(decideAccess(seller, id, 'APPROVE')).rejects.toThrow();
    await decideAccess(seller, id, 'REJECT');
    expect((await db.accessRequest.findUniqueOrThrow({ where: { id } })).status).toBe('REJECTED');
    const rejected = await listAccessRequests(seller, 'REJECTED');
    expect(rejected.items.some((r) => r.id === id)).toBe(true);
  });

  it("a seller cannot approve another seller's request (404)", async () => {
    const buyer = await newBuyer();
    const { id } = await requestAccess(buyer, oppId, { purpose: PURPOSE });
    await signNda(buyer, id, CTX);
    const other = await session((await createTestUser(tag, 'SELLER', 'ENABLED')).id);
    await expect(decideAccess(other, id, 'APPROVE')).rejects.toBeInstanceOf(NotFoundError);
    await expect(revokeAccess(other, id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listAccessRequests(other, 'PENDING')).items).toHaveLength(0);
  });

  it('another buyer cannot sign someone else’s request (404)', async () => {
    const buyer = await newBuyer();
    const { id } = await requestAccess(buyer, oppId, { purpose: PURPOSE });
    await expect(signNda(await newBuyer(), id, CTX)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listConfidentiality', () => {
  it('Back Office sees the seeded rows; others are refused', async () => {
    const rows = await listConfidentiality(bo);
    const cafes = rows.filter((r) => r.opportunityId === oppId);
    const main = cafes.find((r) => r.buyerEmail === 'comprador@demo.ladorada.co');
    const second = cafes.find((r) => r.buyerEmail === 'inversiones.pacifico@demo.ladorada.co');
    expect(main).toMatchObject({ nda: 'SIGNED', access: 'GRANTED', revocable: true });
    expect(second).toMatchObject({ nda: 'SIGNED', access: 'NONE', revocable: false });
    expect(main?.companyName.length).toBeGreaterThan(0);
    await expect(listConfidentiality(seller)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('Back Office can revoke', async () => {
    const buyer = await newBuyer();
    const { id } = await requestAccess(buyer, oppId, { purpose: PURPOSE });
    await signNda(buyer, id, CTX);
    await decideAccess(seller, id, 'APPROVE');
    await revokeAccess(bo, id);
    const row = (await listConfidentiality(bo)).find((r) => r.id === id);
    expect(row).toMatchObject({ access: 'BLOCKED', revocable: false });
  });
});
