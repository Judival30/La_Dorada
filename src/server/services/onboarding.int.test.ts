import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  ValidationError,
} from '@/domain/errors';
import type { SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { getMailer, resetAdaptersForTests as resetMail } from '@/server/mail';
import type { MemoryMailer } from '@/server/mail/memory';
import { getStorage, resetAdaptersForTests as resetStorage } from '@/server/storage';
import type { MemoryStorage } from '@/server/storage/memory';
import { fixtures } from '@/test/file-fixtures';
import {
  BUYER_STEPS,
  SELLER_STEPS,
  cleanupTestUsers,
  createTestUser,
  type TestUser,
} from '@/test/onboarding-fixtures';
import {
  deleteVerificationDocument,
  documentReadUrl,
  getOnboardingState,
  saveStep,
  submitForReview,
  uploadVerificationDocument,
} from './onboarding';

const tag = `svc${randomUUID().slice(0, 8)}`;
const storage = () => getStorage() as MemoryStorage;
const mailer = () => getMailer() as MemoryMailer;
const pdf = (name = 'documento.pdf') => ({ name, bytes: fixtures.pdf() });

const session = async (u: TestUser): Promise<SessionUser> => {
  const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  return { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status };
};

const audits = (action: string, entityId: string) =>
  db.auditLog.findMany({ where: { action, entityId }, orderBy: { seq: 'asc' } });

/** Completes steps 1/3/4 and uploads every required document. */
async function completeSeller(u: TestUser) {
  await saveStep(u.id, 1, SELLER_STEPS[1]);
  await saveStep(u.id, 3, SELLER_STEPS[3]);
  await saveStep(u.id, 4, SELLER_STEPS[4]);
  for (const type of ['NATIONAL_ID', 'CHAMBER_OF_COMMERCE', 'RUT'] as const) {
    await uploadVerificationDocument(u.id, type, pdf());
  }
}

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  process.env.STORAGE_DRIVER = 'memory';
  process.env.MAIL_DRIVER = 'memory';
  resetStorage();
  resetMail();
});

beforeEach(() => {
  vi.restoreAllMocks();
  mailer().clear();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanupTestUsers(tag);
  await db.$disconnect();
});

describe('getOnboardingState', () => {
  it('returns the latest case snapshot with progress for a fresh seller', async () => {
    const u = await createTestUser(tag, 'SELLER');
    const s = await getOnboardingState(u.id);
    expect(s).toMatchObject({
      role: 'SELLER',
      userStatus: 'PENDING',
      caseId: u.caseId,
      caseStatus: 'OPEN',
      profile: {},
      isLegalRepresentative: null,
      buyerType: null,
      documents: [],
      correctionNotes: null,
      rejectionReason: null,
      submittedAt: null,
    });
    expect(s.progress.canSubmit).toBe(false);
    expect(s.progress.completedSteps).toEqual([]);
  });

  it('uses the most recent case', async () => {
    const u = await createTestUser(tag, 'BUYER');
    const newer = await db.verificationCase.create({
      data: { userId: u.id, createdAt: new Date(Date.now() + 1000) },
    });
    expect((await getOnboardingState(u.id)).caseId).toBe(newer.id);
  });

  it('rejects users without an onboarding (BACKOFFICE)', async () => {
    const bo = await createTestUser(tag, 'BACKOFFICE', 'ENABLED');
    await expect(getOnboardingState(bo.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('saveStep', () => {
  it('step 1 stores the profile and updates User.name and User.phone; audit has no PII', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await saveStep(u.id, 1, SELLER_STEPS[1]);

    const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(user).toMatchObject({ name: 'Valentina Ríos', phone: '+573001234567' });
    const s = await getOnboardingState(u.id);
    expect(s.profile.step1).toEqual({ ...SELLER_STEPS[1], phone: '+573001234567' });
    expect(s.progress.completedSteps).toContain(1);

    const a = await audits('ONBOARDING_STEP_SAVED', u.caseId ?? '');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ actorId: u.id, entity: 'VerificationCase', after: { step: 1 } });
    const raw = JSON.stringify([a[0]?.before, a[0]?.after]);
    expect(raw).not.toContain('3001234567');
    expect(raw).not.toContain('Valentina');
  });

  it('step 3 (seller) keeps VerificationCase.isLegalRepresentative in sync with the profile', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await saveStep(u.id, 3, { isLegalRepresentative: false });
    let vc = await db.verificationCase.findUniqueOrThrow({ where: { id: u.caseId ?? '' } });
    expect(vc.isLegalRepresentative).toBe(false);
    let s = await getOnboardingState(u.id);
    expect(s.profile.step3).toEqual({ isLegalRepresentative: false });
    expect(s.progress.missing.map((m) => m.reason).join('\n')).toContain('poder o autorización');

    await saveStep(u.id, 3, { isLegalRepresentative: true });
    vc = await db.verificationCase.findUniqueOrThrow({ where: { id: u.caseId ?? '' } });
    expect(vc.isLegalRepresentative).toBe(true);
    s = await getOnboardingState(u.id);
    expect(s.isLegalRepresentative).toBe(true);
    expect(s.progress.missing.map((m) => m.reason).join('\n')).not.toContain(
      'poder o autorización',
    );
  });

  it('step 3 (buyer) writes VerificationCase.buyerType and replaces the previous step-3 data', async () => {
    const u = await createTestUser(tag, 'BUYER');
    await saveStep(u.id, 3, BUYER_STEPS[3]);
    expect(
      (await db.verificationCase.findUniqueOrThrow({ where: { id: u.caseId ?? '' } })).buyerType,
    ).toBe('FUND');
    await saveStep(u.id, 3, { buyerType: 'ANGEL' });
    const s = await getOnboardingState(u.id);
    expect(s.buyerType).toBe('ANGEL');
    expect(s.profile.step3).toEqual({ buyerType: 'ANGEL' });
  });

  it('step 3 uses the schema of the user role', async () => {
    const seller = await createTestUser(tag, 'SELLER');
    await expect(saveStep(seller.id, 3, { buyerType: 'ANGEL' })).rejects.toThrow();
    const buyer = await createTestUser(tag, 'BUYER');
    await expect(saveStep(buyer.id, 3, { isLegalRepresentative: true })).rejects.toThrow();
  });

  it('step 4 (buyer) upserts BuyerPreferences with BigInt pesos', async () => {
    const u = await createTestUser(tag, 'BUYER');
    await saveStep(u.id, 4, BUYER_STEPS[4]);
    await saveStep(u.id, 4, { ...BUYER_STEPS[4], ticketMaxMillions: 3000 });

    const prefs = await db.buyerPreferences.findMany({ where: { userId: u.id } });
    expect(prefs).toHaveLength(1);
    expect(prefs[0]).toMatchObject({
      sectors: ['SALUD', 'TECNOLOGIA'],
      regions: ['Antioquia', 'Bogotá D.C.'],
      ticketMin: 500_000_000n,
      ticketMax: 3_000_000_000n,
    });
    expect((await getOnboardingState(u.id)).progress.completedSteps).toContain(4);
  });

  it('step 4 (seller) stores the company in the profile only (no Organization/Company yet)', async () => {
    const u = await createTestUser(tag, 'SELLER');
    const orgs = await db.organization.count();
    const companies = await db.company.count();
    await saveStep(u.id, 4, SELLER_STEPS[4]);
    expect((await getOnboardingState(u.id)).profile.step4).toEqual(SELLER_STEPS[4]);
    expect(await db.organization.count()).toBe(orgs);
    expect(await db.company.count()).toBe(companies);
  });

  it('rejects a department or region outside DEPARTMENTS and leaves the profile untouched', async () => {
    const seller = await createTestUser(tag, 'SELLER');
    await expect(
      saveStep(seller.id, 4, { ...SELLER_STEPS[4], department: 'Texas' }),
    ).rejects.toThrow();
    expect((await getOnboardingState(seller.id)).profile).toEqual({});

    const buyer = await createTestUser(tag, 'BUYER');
    await expect(
      saveStep(buyer.id, 4, { ...BUYER_STEPS[4], regions: ['Antioquia', 'Narnia'] }),
    ).rejects.toThrow();
    expect(await db.buyerPreferences.count({ where: { userId: buyer.id } })).toBe(0);
  });

  it('rejects invalid data without writing anything', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await expect(saveStep(u.id, 1, { name: 'A', phone: 'x', position: '' })).rejects.toThrow();
    const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(user.phone).toBeNull();
    expect(await audits('ONBOARDING_STEP_SAVED', u.caseId ?? '')).toHaveLength(0);
  });

  it.each(['IN_REVIEW', 'ENABLED', 'REJECTED', 'BLOCKED'] as const)(
    'is forbidden while the user is %s',
    async (status) => {
      const u = await createTestUser(tag, 'SELLER', status);
      await expect(saveStep(u.id, 1, SELLER_STEPS[1])).rejects.toBeInstanceOf(ForbiddenError);
    },
  );

  it('is allowed while CORRECTIONS_REQUESTED', async () => {
    const u = await createTestUser(tag, 'SELLER', 'CORRECTIONS_REQUESTED');
    await expect(saveStep(u.id, 1, SELLER_STEPS[1])).resolves.toBeUndefined();
  });
});

describe('uploadVerificationDocument', () => {
  it('stores a sniffed PDF under verification/<caseId>/<uuid> with a sanitized name and audits it', async () => {
    const u = await createTestUser(tag, 'SELLER');
    const { id } = await uploadVerificationDocument(u.id, 'NATIONAL_ID', {
      name: 'C:\\fakepath\\mi cédula.pdf',
      bytes: fixtures.pdf(),
    });

    const doc = await db.verificationDocument.findUniqueOrThrow({ where: { id } });
    expect(doc).toMatchObject({
      verificationCaseId: u.caseId,
      type: 'NATIONAL_ID',
      mime: 'application/pdf',
      size: fixtures.pdf().length,
      originalName: 'mi cédula.pdf',
      reviewStatus: 'PENDING',
    });
    expect(doc.storageKey).toMatch(
      new RegExp(
        `^verification/${u.caseId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
      ),
    );
    const obj = storage().objects.get(doc.storageKey);
    expect(obj?.contentType).toBe('application/pdf');
    expect(obj?.body.equals(fixtures.pdf())).toBe(true);

    const a = await audits('VERIFICATION_DOCUMENT_UPLOADED', id);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ actorId: u.id, entity: 'VerificationDocument' });
    expect(JSON.stringify(a[0]?.after)).not.toContain('cédula.pdf');

    const s = await getOnboardingState(u.id);
    expect(s.documents).toEqual([
      expect.objectContaining({
        id,
        type: 'NATIONAL_ID',
        label: 'Cédula de ciudadanía',
        reviewStatus: 'PENDING',
        originalName: 'mi cédula.pdf',
      }),
    ]);
    expect(s.documents[0]).not.toHaveProperty('storageKey');
  });

  it('uses the sniffed type, not the file name (PNG named .pdf)', async () => {
    const u = await createTestUser(tag, 'SELLER');
    const { id } = await uploadVerificationDocument(u.id, 'RUT', {
      name: 'rut.pdf',
      bytes: fixtures.png(),
    });
    expect((await db.verificationDocument.findUniqueOrThrow({ where: { id } })).mime).toBe(
      'image/png',
    );
  });

  it('rejects an executable renamed to .pdf and creates nothing', async () => {
    const u = await createTestUser(tag, 'SELLER');
    const objects = storage().objects.size;
    await expect(
      uploadVerificationDocument(u.id, 'NATIONAL_ID', {
        name: 'cedula.pdf',
        bytes: fixtures.exe(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(
      await db.verificationDocument.count({ where: { verificationCaseId: u.caseId ?? '' } }),
    ).toBe(0);
    expect(storage().objects.size).toBe(objects);
  });

  it('rejects a file over 10 MB and an empty file', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await expect(
      uploadVerificationDocument(u.id, 'NATIONAL_ID', {
        name: 'grande.pdf',
        bytes: fixtures.pdfOfSize(10 * 1024 * 1024 + 1),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      uploadVerificationDocument(u.id, 'NATIONAL_ID', {
        name: 'vacio.pdf',
        bytes: Buffer.alloc(0),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Exactly 10 MB is accepted.
    await expect(
      uploadVerificationDocument(u.id, 'NATIONAL_ID', {
        name: 'limite.pdf',
        bytes: fixtures.pdfOfSize(10 * 1024 * 1024),
      }),
    ).resolves.toHaveProperty('id');
  });

  it('rejects an unknown document type', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await expect(
      uploadVerificationDocument(u.id, 'PASSPORT' as never, pdf()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('replaces the previous document of the same type and deletes its object after commit', async () => {
    const u = await createTestUser(tag, 'SELLER');
    const first = await uploadVerificationDocument(u.id, 'RUT', pdf('rut-viejo.pdf'));
    const oldKey = (await db.verificationDocument.findUniqueOrThrow({ where: { id: first.id } }))
      .storageKey;
    const second = await uploadVerificationDocument(u.id, 'RUT', {
      name: 'rut-nuevo.png',
      bytes: fixtures.png(),
    });

    const docs = await db.verificationDocument.findMany({
      where: { verificationCaseId: u.caseId ?? '', type: 'RUT' },
    });
    expect(docs.map((d) => d.id)).toEqual([second.id]);
    expect(storage().objects.has(oldKey)).toBe(false);
    expect(storage().objects.has(docs[0]?.storageKey ?? '')).toBe(true);
    const a = await audits('VERIFICATION_DOCUMENT_UPLOADED', second.id);
    expect(a[0]?.after).toMatchObject({ replacedDocumentId: first.id });
  });

  it('deletes the new object when the transaction fails, keeping the old document', async () => {
    const u = await createTestUser(tag, 'SELLER');
    const first = await uploadVerificationDocument(u.id, 'RUT', pdf());
    const before = new Set(storage().objects.keys());
    vi.spyOn(db, '$transaction').mockRejectedValueOnce(new Error('db down'));

    await expect(uploadVerificationDocument(u.id, 'RUT', pdf())).rejects.toThrow('db down');
    expect(new Set(storage().objects.keys())).toEqual(before);
    const docs = await db.verificationDocument.findMany({
      where: { verificationCaseId: u.caseId ?? '' },
    });
    expect(docs.map((d) => d.id)).toEqual([first.id]);
  });

  it('logs and moves on when deleting the replaced object fails', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await uploadVerificationDocument(u.id, 'RUT', pdf());
    const del = vi.spyOn(storage(), 'delete').mockRejectedValueOnce(new Error('s3 down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(uploadVerificationDocument(u.id, 'RUT', pdf())).resolves.toHaveProperty('id');
    expect(del).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
  });

  it.each(['IN_REVIEW', 'ENABLED', 'REJECTED', 'BLOCKED'] as const)(
    'is forbidden while the user is %s (nothing stored)',
    async (status) => {
      const u = await createTestUser(tag, 'SELLER', status);
      const objects = storage().objects.size;
      await expect(uploadVerificationDocument(u.id, 'RUT', pdf())).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(storage().objects.size).toBe(objects);
    },
  );
});

describe('deleteVerificationDocument', () => {
  it('lets the owner delete: row, object and audit', async () => {
    const u = await createTestUser(tag, 'SELLER');
    const { id } = await uploadVerificationDocument(u.id, 'RUT', pdf());
    const key = (await db.verificationDocument.findUniqueOrThrow({ where: { id } })).storageKey;

    await deleteVerificationDocument(u.id, id);
    expect(await db.verificationDocument.count({ where: { id } })).toBe(0);
    expect(storage().objects.has(key)).toBe(false);
    const a = await audits('VERIFICATION_DOCUMENT_DELETED', id);
    expect(a[0]).toMatchObject({ actorId: u.id, before: { documentId: id, type: 'RUT' } });
  });

  it("gives NotFoundError for someone else's or an unknown document", async () => {
    const a = await createTestUser(tag, 'SELLER');
    const b = await createTestUser(tag, 'SELLER');
    const { id } = await uploadVerificationDocument(b.id, 'RUT', pdf());
    await expect(deleteVerificationDocument(a.id, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteVerificationDocument(a.id, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.verificationDocument.count({ where: { id } })).toBe(1);
  });

  it('is forbidden once the user is IN_REVIEW', async () => {
    const u = await createTestUser(tag, 'SELLER');
    const { id } = await uploadVerificationDocument(u.id, 'RUT', pdf());
    await db.user.update({ where: { id: u.id }, data: { status: 'IN_REVIEW' } });
    await expect(deleteVerificationDocument(u.id, id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.verificationDocument.count({ where: { id } })).toBe(1);
  });
});

describe('documentReadUrl', () => {
  it('gives the owner and an ENABLED BACKOFFICE a 60 s URL and audits each view', async () => {
    const u = await createTestUser(tag, 'SELLER');
    const bo = await createTestUser(tag, 'BACKOFFICE', 'ENABLED');
    const { id } = await uploadVerificationDocument(u.id, 'NATIONAL_ID', pdf());
    const key = (await db.verificationDocument.findUniqueOrThrow({ where: { id } })).storageKey;

    expect(await documentReadUrl(await session(u), id)).toBe(`memory://${key}?ttl=60`);
    expect(await documentReadUrl(await session(bo), id)).toBe(`memory://${key}?ttl=60`);

    const a = await audits('VERIFICATION_DOCUMENT_VIEWED', id);
    expect(a.map((r) => r.actorId)).toEqual([u.id, bo.id]);
    expect(a[1]?.after).toEqual({ documentId: id, type: 'NATIONAL_ID' });
  });

  it('gives NotFoundError to another applicant and to a non-ENABLED BACKOFFICE', async () => {
    const owner = await createTestUser(tag, 'SELLER');
    const other = await createTestUser(tag, 'BUYER');
    const blockedBo = await createTestUser(tag, 'BACKOFFICE', 'BLOCKED');
    const { id } = await uploadVerificationDocument(owner.id, 'RUT', pdf());

    await expect(documentReadUrl(await session(other), id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(documentReadUrl(await session(blockedBo), id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await audits('VERIFICATION_DOCUMENT_VIEWED', id)).toHaveLength(0);
  });
});

describe('submitForReview', () => {
  it('rejects an incomplete onboarding with the missing reasons and changes nothing', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await saveStep(u.id, 1, SELLER_STEPS[1]);

    const err = await submitForReview(u.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    const lines = (err as Error).message.split('\n');
    expect(lines).toContain('Sube tu cédula de ciudadanía para verificar tu identidad.');
    expect(lines).toContain('Falta el RUT para validar la información tributaria.');
    expect(lines.length).toBeGreaterThanOrEqual(4);

    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('PENDING');
    const vc = await db.verificationCase.findUniqueOrThrow({ where: { id: u.caseId ?? '' } });
    expect(vc).toMatchObject({ status: 'OPEN', submittedAt: null });
    expect(await db.notification.count({ where: { userId: u.id } })).toBe(0);
    expect(await audits('ONBOARDING_SUBMITTED', u.id)).toHaveLength(0);
  });

  it('submits a complete onboarding: IN_REVIEW, notifications, audit and emails after commit', async () => {
    const u = await createTestUser(tag, 'SELLER');
    const bo1 = await createTestUser(tag, 'BACKOFFICE', 'ENABLED');
    const bo2 = await createTestUser(tag, 'BACKOFFICE', 'ENABLED');
    const boBlocked = await createTestUser(tag, 'BACKOFFICE', 'BLOCKED');
    await completeSeller(u);
    const before = Date.now();

    await submitForReview(u.id);

    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('IN_REVIEW');
    const vc = await db.verificationCase.findUniqueOrThrow({ where: { id: u.caseId ?? '' } });
    expect(vc.status).toBe('IN_REVIEW');
    expect(vc.submittedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);

    const own = await db.notification.findMany({ where: { userId: u.id } });
    expect(own.map((n) => n.kind)).toEqual(['ONBOARDING_SUBMITTED']);
    for (const bo of [bo1, bo2]) {
      const ns = await db.notification.findMany({ where: { userId: bo.id } });
      expect(ns).toHaveLength(1);
      expect(ns[0]).toMatchObject({ kind: 'NEW_USER_TO_REVIEW', payload: { userId: u.id } });
    }
    expect(await db.notification.count({ where: { userId: boBlocked.id } })).toBe(0);

    const a = await audits('ONBOARDING_SUBMITTED', u.id);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ actorId: u.id, entity: 'User', after: { caseId: u.caseId } });

    const to = mailer().sent.map((m) => m.to);
    expect(to).toEqual(expect.arrayContaining([u.email, bo1.email, bo2.email]));
    expect(to).not.toContain(boBlocked.email);
    expect(mailer().sent.find((m) => m.to === u.email)?.subject).toBe(
      'Recibimos tu solicitud de verificación',
    );
  });

  it('after IN_REVIEW: saveStep and upload are forbidden, submitting again is an invalid transition', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await completeSeller(u);
    await submitForReview(u.id);

    await expect(saveStep(u.id, 1, SELLER_STEPS[1])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(uploadVerificationDocument(u.id, 'RUT', pdf())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(submitForReview(u.id)).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('resubmits from CORRECTIONS_REQUESTED (RESUBMIT)', async () => {
    const u = await createTestUser(tag, 'BUYER', 'CORRECTIONS_REQUESTED');
    await saveStep(u.id, 1, BUYER_STEPS[1]);
    await saveStep(u.id, 3, BUYER_STEPS[3]);
    await saveStep(u.id, 4, BUYER_STEPS[4]);
    for (const type of ['NATIONAL_ID', 'CHAMBER_OF_COMMERCE', 'RUT'] as const) {
      await uploadVerificationDocument(u.id, type, pdf());
    }
    await submitForReview(u.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('IN_REVIEW');
    expect(
      (await db.verificationCase.findUniqueOrThrow({ where: { id: u.caseId ?? '' } })).status,
    ).toBe('IN_REVIEW');
  });

  it('serializes concurrent submissions: exactly one succeeds', async () => {
    const u = await createTestUser(tag, 'SELLER');
    await completeSeller(u);
    const results = await Promise.allSettled([submitForReview(u.id), submitForReview(u.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InvalidTransitionError);
    expect(await audits('ONBOARDING_SUBMITTED', u.id)).toHaveLength(1);
  });
});
