import { randomUUID } from 'node:crypto';
import type { UserStatus } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  ValidationError,
} from '@/domain/errors';
import { DEFAULT_KYC_CHECKLIST } from '@/domain/onboarding';
import { audited } from '@/server/audit/audited';
import { createSession, validateSession, type SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { getMailer, resetAdaptersForTests as resetMail } from '@/server/mail';
import type { MemoryMailer } from '@/server/mail/memory';
import { resetAdaptersForTests as resetStorage } from '@/server/storage';
import { fixtures } from '@/test/file-fixtures';
import {
  SELLER_STEPS,
  cleanupTestUsers,
  createTestUser,
  type TestUser,
} from '@/test/onboarding-fixtures';
import {
  getOnboardingState,
  saveStep,
  submitForReview,
  uploadVerificationDocument,
} from './onboarding';
import {
  blockUser,
  decideUser,
  getUserReview,
  listUsersForReview,
  reviewDocument,
  runKycScreening,
  toggleKycItem,
  unblockUser,
} from './user-review';

const tag = `urv${randomUUID().slice(0, 8)}`;
const mailer = () => getMailer() as MemoryMailer;
const pdf = () => ({ name: 'documento.pdf', bytes: fixtures.pdf() });
const NOTES = 'Por favor sube una versión legible de la Cámara de Comercio.';
const REASON = 'La información de la empresa no coincide con los soportes.';

const session = async (id: string): Promise<SessionUser> => {
  const row = await db.user.findUniqueOrThrow({ where: { id } });
  return { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status };
};

const audits = (action: string, entityId: string) =>
  db.auditLog.findMany({ where: { action, entityId }, orderBy: { seq: 'asc' } });

let bo: SessionUser;

/** A SELLER with a complete onboarding submitted for review, plus the default KYC checklist. */
async function inReviewSeller(t = tag): Promise<TestUser & { caseId: string }> {
  const u = await createTestUser(t, 'SELLER');
  const caseId = u.caseId as string;
  await db.kycChecklistItem.createMany({
    data: DEFAULT_KYC_CHECKLIST.map((label) => ({ verificationCaseId: caseId, label })),
  });
  await saveStep(u.id, 1, SELLER_STEPS[1]);
  await saveStep(u.id, 3, SELLER_STEPS[3]);
  await saveStep(u.id, 4, SELLER_STEPS[4]);
  for (const type of ['NATIONAL_ID', 'CHAMBER_OF_COMMERCE', 'RUT'] as const) {
    await uploadVerificationDocument(u.id, type, pdf());
  }
  await submitForReview(u.id);
  return { ...u, caseId };
}

async function approveAllDocuments(caseId: string) {
  const docs = await db.verificationDocument.findMany({ where: { verificationCaseId: caseId } });
  for (const d of docs) await reviewDocument(bo, d.id, 'APPROVED');
}

async function checkAllKyc(caseId: string) {
  const items = await db.kycChecklistItem.findMany({ where: { verificationCaseId: caseId } });
  for (const i of items) await toggleKycItem(bo, i.id, true);
}

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  process.env.STORAGE_DRIVER = 'memory';
  process.env.MAIL_DRIVER = 'memory';
  resetStorage();
  resetMail();
  const b = await createTestUser(tag, 'BACKOFFICE', 'ENABLED');
  await db.user.update({ where: { id: b.id }, data: { name: 'Revisora Back Office' } });
  bo = await session(b.id);
});

beforeEach(() => {
  vi.restoreAllMocks();
  mailer().clear();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await db.organization.deleteMany({ where: { name: { contains: tag } } });
  await cleanupTestUsers(tag);
  await db.$disconnect();
});

describe('authorization', () => {
  it('rejects a SELLER actor with ForbiddenError on every operation', async () => {
    const u = await inReviewSeller();
    const seller = await session((await createTestUser(tag, 'SELLER', 'ENABLED')).id);
    const doc = await db.verificationDocument.findFirstOrThrow({
      where: { verificationCaseId: u.caseId },
    });
    const item = await db.kycChecklistItem.findFirstOrThrow({
      where: { verificationCaseId: u.caseId },
    });

    await expect(listUsersForReview(seller, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getUserReview(seller, u.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reviewDocument(seller, doc.id, 'APPROVED')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(toggleKycItem(seller, item.id, true)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(runKycScreening(seller, u.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(decideUser(seller, u.id, { kind: 'APPROVE' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(blockUser(seller, u.id, REASON)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(unblockUser(seller, u.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('IN_REVIEW');
  });

  it('rejects a BACKOFFICE that is not ENABLED', async () => {
    const u = await inReviewSeller();
    const blockedBo = await session((await createTestUser(tag, 'BACKOFFICE', 'BLOCKED')).id);
    await expect(decideUser(blockedBo, u.id, { kind: 'APPROVE' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(listUsersForReview(blockedBo, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a BACKOFFICE cannot decide, block or unblock themselves', async () => {
    await expect(decideUser(bo, bo.id, { kind: 'APPROVE' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(blockUser(bo, bo.id, REASON)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(unblockUser(bo, bo.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cannot block another BACKOFFICE account', async () => {
    const other = await createTestUser(tag, 'BACKOFFICE', 'ENABLED');
    await expect(blockUser(bo, other.id, REASON)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('ENABLED');
  });
});

describe('decideUser APPROVE', () => {
  it('without the KYC checklist complete → ValidationError listing what is missing; nothing changes', async () => {
    const u = await inReviewSeller();
    await approveAllDocuments(u.caseId);

    const err = await decideUser(bo, u.id, { kind: 'APPROVE' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    const msg = (err as Error).message;
    for (const label of DEFAULT_KYC_CHECKLIST) expect(msg).toContain(label);

    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('IN_REVIEW');
    expect(await audits('USER_APPROVED', u.id)).toHaveLength(0);
  });

  it('with an empty KYC checklist → ValidationError; nothing changes', async () => {
    const u = await inReviewSeller();
    await approveAllDocuments(u.caseId);
    await db.kycChecklistItem.deleteMany({ where: { verificationCaseId: u.caseId } });

    const err = await decideUser(bo, u.id, { kind: 'APPROVE' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as Error).message).toBe('El caso no tiene checklist KYC; no se puede aprobar.');
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('IN_REVIEW');
    expect(await audits('USER_APPROVED', u.id)).toHaveLength(0);
  });

  it('without every required document APPROVED →ValidationError naming the documents', async () => {
    const u = await inReviewSeller();
    await checkAllKyc(u.caseId);
    const rut = await db.verificationDocument.findFirstOrThrow({
      where: { verificationCaseId: u.caseId, type: 'RUT' },
    });
    await reviewDocument(bo, rut.id, 'APPROVED');

    const err = await decideUser(bo, u.id, { kind: 'APPROVE' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    const msg = (err as Error).message;
    expect(msg).toContain('Cédula de ciudadanía');
    expect(msg).toContain('Certificado de Cámara de Comercio');
    expect(msg).not.toContain('RUT');
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('IN_REVIEW');
  });

  it('full flow: IN_REVIEW → review docs, KYC, screening → APPROVE → ENABLED, audited and notified', async () => {
    const u = await inReviewSeller();
    await approveAllDocuments(u.caseId);
    const items = await db.kycChecklistItem.findMany({ where: { verificationCaseId: u.caseId } });
    for (const i of items.filter((x) => !x.label.startsWith('Consulta en listas restrictivas'))) {
      await toggleKycItem(bo, i.id, true);
    }
    const screening = await runKycScreening(bo, u.id);
    expect(screening).toMatchObject({ matches: [], provider: 'mock' });
    expect(screening.checkedAt).toBeInstanceOf(Date);

    mailer().clear();
    await decideUser(bo, u.id, { kind: 'APPROVE' });

    const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(user.status).toBe('ENABLED');
    const vc = await db.verificationCase.findUniqueOrThrow({ where: { id: u.caseId } });
    expect(vc).toMatchObject({ status: 'APPROVED', decidedById: bo.id, correctionNotes: null });
    expect(vc.decidedAt).toBeInstanceOf(Date);

    const a = await audits('USER_APPROVED', u.id);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      actorId: bo.id,
      entity: 'User',
      after: { caseId: u.caseId, decision: 'APPROVE' },
    });
    const n = await db.notification.findMany({
      where: { userId: u.id, kind: 'ONBOARDING_APPROVED' },
    });
    expect(n).toHaveLength(1);
    expect(mailer().sent.map((m) => m.to)).toEqual([u.email]);
    expect(mailer().sent[0]?.subject).toBe('Tu cuenta fue aprobada');
  });

  it('two concurrent decisions (APPROVE and REJECT): exactly one wins, the other gets InvalidTransitionError', async () => {
    const u = await inReviewSeller();
    await approveAllDocuments(u.caseId);
    await checkAllKyc(u.caseId);

    const results = await Promise.allSettled([
      decideUser(bo, u.id, { kind: 'APPROVE' }),
      decideUser(bo, u.id, { kind: 'REJECT', reason: REASON }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(InvalidTransitionError);

    const status = (await db.user.findUniqueOrThrow({ where: { id: u.id } })).status;
    expect(['ENABLED', 'REJECTED']).toContain(status);
    const decided =
      (await audits('USER_APPROVED', u.id)).length + (await audits('USER_REJECTED', u.id)).length;
    expect(decided).toBe(1);
  });
});

describe('decideUser REQUEST_CORRECTIONS / REJECT', () => {
  it('request corrections stores the notes, keeps rejected documents, user → CORRECTIONS_REQUESTED', async () => {
    const u = await inReviewSeller();
    const ccio = await db.verificationDocument.findFirstOrThrow({
      where: { verificationCaseId: u.caseId, type: 'CHAMBER_OF_COMMERCE' },
    });
    await reviewDocument(bo, ccio.id, 'REJECTED');

    mailer().clear();
    await decideUser(bo, u.id, { kind: 'REQUEST_CORRECTIONS', notes: `  ${NOTES}  ` });

    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe(
      'CORRECTIONS_REQUESTED',
    );
    const vc = await db.verificationCase.findUniqueOrThrow({ where: { id: u.caseId } });
    expect(vc).toMatchObject({
      status: 'CORRECTIONS_REQUESTED',
      correctionNotes: NOTES,
      decidedById: bo.id,
    });
    expect(
      (await db.verificationDocument.findUniqueOrThrow({ where: { id: ccio.id } })).reviewStatus,
    ).toBe('REJECTED');

    const a = await audits('USER_CORRECTIONS_REQUESTED', u.id);
    expect(a).toHaveLength(1);
    expect(a[0]?.after).toEqual({ caseId: u.caseId, decision: 'REQUEST_CORRECTIONS' });
    expect(JSON.stringify([a[0]?.before, a[0]?.after])).not.toContain('legible');
    expect(
      await db.notification.count({ where: { userId: u.id, kind: 'ONBOARDING_CORRECTIONS' } }),
    ).toBe(1);
    expect(mailer().sent.map((m) => m.to)).toEqual([u.email]);
  });

  it('notes and reason must be 10–1000 characters after trimming', async () => {
    const u = await inReviewSeller();
    await expect(
      decideUser(bo, u.id, { kind: 'REQUEST_CORRECTIONS', notes: '   corto   ' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      decideUser(bo, u.id, { kind: 'REJECT', reason: 'x'.repeat(1001) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('IN_REVIEW');
  });

  it('reject stores the reason and user → REJECTED; audit without the reason text', async () => {
    const u = await inReviewSeller();
    await decideUser(bo, u.id, { kind: 'REJECT', reason: REASON });

    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('REJECTED');
    const vc = await db.verificationCase.findUniqueOrThrow({ where: { id: u.caseId } });
    expect(vc).toMatchObject({ status: 'REJECTED', rejectionReason: REASON, decidedById: bo.id });
    const a = await audits('USER_REJECTED', u.id);
    expect(a[0]?.after).toEqual({ caseId: u.caseId, decision: 'REJECT' });
    expect(
      await db.notification.count({ where: { userId: u.id, kind: 'ONBOARDING_REJECTED' } }),
    ).toBe(1);
  });

  it('deciding a user who is not IN_REVIEW → InvalidTransitionError', async () => {
    const u = await createTestUser(tag, 'SELLER', 'PENDING');
    await expect(decideUser(bo, u.id, { kind: 'REJECT', reason: REASON })).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });

  it('unknown user → NotFoundError', async () => {
    await expect(decideUser(bo, 'no-existe', { kind: 'APPROVE' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('reviewDocument / toggleKycItem / runKycScreening', () => {
  it('reviewDocument sets the review status and audits ids and states only', async () => {
    const u = await inReviewSeller();
    const doc = await db.verificationDocument.findFirstOrThrow({
      where: { verificationCaseId: u.caseId, type: 'RUT' },
    });
    await reviewDocument(bo, doc.id, 'REJECTED');
    expect(
      (await db.verificationDocument.findUniqueOrThrow({ where: { id: doc.id } })).reviewStatus,
    ).toBe('REJECTED');
    const a = await audits('VERIFICATION_DOCUMENT_REVIEWED', doc.id);
    expect(a[0]).toMatchObject({
      actorId: bo.id,
      entity: 'VerificationDocument',
      before: { reviewStatus: 'PENDING' },
      after: { documentId: doc.id, caseId: u.caseId, type: 'RUT', reviewStatus: 'REJECTED' },
    });
  });

  it('toggleKycItem records who checked it and when, and clears that on uncheck', async () => {
    const u = await inReviewSeller();
    const item = await db.kycChecklistItem.findFirstOrThrow({
      where: { verificationCaseId: u.caseId },
    });
    await toggleKycItem(bo, item.id, true);
    let row = await db.kycChecklistItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row).toMatchObject({ done: true, checkedById: bo.id });
    expect(row.checkedAt).toBeInstanceOf(Date);

    await toggleKycItem(bo, item.id, false);
    row = await db.kycChecklistItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row).toMatchObject({ done: false, checkedById: null, checkedAt: null });
    const a = await audits('KYC_ITEM_CHECKED', item.id);
    expect(a.map((r) => r.after)).toEqual([
      { itemId: item.id, caseId: u.caseId, done: true },
      { itemId: item.id, caseId: u.caseId, done: false },
    ]);
  });

  it('only while the user is IN_REVIEW (InvalidTransitionError otherwise)', async () => {
    const u = await createTestUser(tag, 'SELLER', 'PENDING');
    const caseId = u.caseId as string;
    await db.kycChecklistItem.createMany({
      data: DEFAULT_KYC_CHECKLIST.map((label) => ({ verificationCaseId: caseId, label })),
    });
    const { id: docId } = await uploadVerificationDocument(u.id, 'NATIONAL_ID', pdf());
    const item = await db.kycChecklistItem.findFirstOrThrow({
      where: { verificationCaseId: caseId },
    });
    await expect(reviewDocument(bo, docId, 'APPROVED')).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    await expect(toggleKycItem(bo, item.id, true)).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(runKycScreening(bo, u.id)).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('runKycScreening (mock) marks the restrictive-lists item and audits KYC_SCREENING_RUN', async () => {
    const u = await inReviewSeller();
    await runKycScreening(bo, u.id);
    const item = await db.kycChecklistItem.findFirstOrThrow({
      where: {
        verificationCaseId: u.caseId,
        label: { startsWith: 'Consulta en listas restrictivas' },
      },
    });
    expect(item).toMatchObject({ done: true, checkedById: bo.id });
    const others = await db.kycChecklistItem.count({
      where: { verificationCaseId: u.caseId, done: true },
    });
    expect(others).toBe(1);
    const a = await audits('KYC_SCREENING_RUN', u.caseId);
    expect(a[0]).toMatchObject({
      actorId: bo.id,
      after: { caseId: u.caseId, provider: 'mock', matchCount: 0 },
    });
  });

  it('unknown document or item → NotFoundError', async () => {
    await expect(reviewDocument(bo, 'no-existe', 'APPROVED')).rejects.toBeInstanceOf(NotFoundError);
    await expect(toggleKycItem(bo, 'no-existe', true)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('corrections round invalidates stale approvals', () => {
  /** In review → every document APPROVED and every KYC item done → corrections requested. */
  async function correctionsAfterFullReview() {
    const u = await inReviewSeller();
    await approveAllDocuments(u.caseId);
    await checkAllKyc(u.caseId);
    await decideUser(bo, u.id, { kind: 'REQUEST_CORRECTIONS', notes: NOTES });
    return u;
  }
  const docStatus = async (caseId: string) =>
    Object.fromEntries(
      (await db.verificationDocument.findMany({ where: { verificationCaseId: caseId } })).map(
        (d) => [d.type, d.reviewStatus],
      ),
    );

  it('name change → resubmit → APPROVE throws ValidationError; user stays IN_REVIEW; KYC not done', async () => {
    const u = await correctionsAfterFullReview();
    await saveStep(u.id, 1, { ...SELLER_STEPS[1], name: 'Valentina Ríos Mejía' });
    expect(await docStatus(u.caseId)).toEqual({
      NATIONAL_ID: 'PENDING',
      CHAMBER_OF_COMMERCE: 'APPROVED',
      RUT: 'APPROVED',
    });
    await submitForReview(u.id);

    const items = await db.kycChecklistItem.findMany({ where: { verificationCaseId: u.caseId } });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => !i.done && i.checkedById === null && i.checkedAt === null)).toBe(
      true,
    );
    await expect(decideUser(bo, u.id, { kind: 'APPROVE' })).rejects.toBeInstanceOf(ValidationError);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('IN_REVIEW');
  });

  it('resubmit resets the KYC checklist even when nothing changed; documents keep their status', async () => {
    const u = await correctionsAfterFullReview();
    await saveStep(u.id, 1, SELLER_STEPS[1]);
    await saveStep(u.id, 3, SELLER_STEPS[3]);
    await saveStep(u.id, 4, SELLER_STEPS[4]);
    await submitForReview(u.id);
    expect(
      await db.kycChecklistItem.count({ where: { verificationCaseId: u.caseId, done: true } }),
    ).toBe(0);
    expect(Object.values(await docStatus(u.caseId)).every((s) => s === 'APPROVED')).toBe(true);
  });

  it('legal-rep change resets Cámara de Comercio and poder; NIT change resets Cámara and RUT', async () => {
    const u = await correctionsAfterFullReview();
    await uploadVerificationDocument(u.id, 'POWER_OF_ATTORNEY', pdf());
    await db.verificationDocument.updateMany({
      where: { verificationCaseId: u.caseId },
      data: { reviewStatus: 'APPROVED' },
    });

    await saveStep(u.id, 3, { isLegalRepresentative: false });
    expect(await docStatus(u.caseId)).toEqual({
      NATIONAL_ID: 'APPROVED',
      CHAMBER_OF_COMMERCE: 'PENDING',
      RUT: 'APPROVED',
      POWER_OF_ATTORNEY: 'PENDING',
    });

    await db.verificationDocument.updateMany({
      where: { verificationCaseId: u.caseId },
      data: { reviewStatus: 'APPROVED' },
    });
    await saveStep(u.id, 4, { ...SELLER_STEPS[4], nit: '900.765.432-1' });
    expect(await docStatus(u.caseId)).toEqual({
      NATIONAL_ID: 'APPROVED',
      CHAMBER_OF_COMMERCE: 'PENDING',
      RUT: 'PENDING',
      POWER_OF_ATTORNEY: 'APPROVED',
    });
  });
});

describe('blockUser / unblockUser', () => {
  it('block invalidates every session in the same transaction, notifies and audits', async () => {
    const u = await createTestUser(tag, 'BUYER', 'ENABLED');
    const s1 = await createSession(u.id);
    const s2 = await createSession(u.id);
    expect(await validateSession(s1.token)).not.toBeNull();

    await blockUser(bo, u.id, REASON);

    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('BLOCKED');
    expect(await validateSession(s1.token)).toBeNull();
    expect(await validateSession(s2.token)).toBeNull();
    const a = await audits('USER_BLOCKED', u.id);
    expect(a[0]).toMatchObject({
      actorId: bo.id,
      before: { status: 'ENABLED' },
      after: { status: 'BLOCKED' },
    });
    expect(JSON.stringify(a[0]?.after)).not.toContain('soportes');
    expect(await db.notification.count({ where: { userId: u.id, kind: 'ACCOUNT_BLOCKED' } })).toBe(
      1,
    );
    expect(mailer().sent.map((m) => m.subject)).toEqual(['Tu cuenta fue bloqueada']);
  });

  it('block stores the reason and time durably (never in the audit); unblock clears them', async () => {
    const u = await createTestUser(tag, 'SELLER', 'ENABLED');
    const before = Date.now();
    await blockUser(bo, u.id, `  ${REASON}  `);

    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.blockedReason).toBe(REASON);
    expect(row.blockedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const a = await audits('USER_BLOCKED', u.id);
    expect(JSON.stringify([a[0]?.before, a[0]?.after])).not.toContain('soportes');

    const review = await getUserReview(bo, u.id);
    expect(review.user).toMatchObject({ blockedReason: REASON, blockedAt: row.blockedAt });
    expect((await getOnboardingState(u.id)).blockedReason).toBe(REASON);

    await unblockUser(bo, u.id);
    const cleared = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(cleared).toMatchObject({ status: 'ENABLED', blockedReason: null, blockedAt: null });
    expect((await getUserReview(bo, u.id)).user).toMatchObject({
      blockedReason: null,
      blockedAt: null,
    });
  });

  it('block keeps sessions when the transaction fails (short reason, wrong status)', async () => {
    const u = await createTestUser(tag, 'BUYER', 'PENDING');
    const s = await createSession(u.id);
    await expect(blockUser(bo, u.id, 'corto')).rejects.toBeInstanceOf(ValidationError);
    await expect(blockUser(bo, u.id, REASON)).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(await validateSession(s.token)).not.toBeNull();
  });

  it('unblock BLOCKED → ENABLED, notifies and audits', async () => {
    const u = await createTestUser(tag, 'SELLER', 'BLOCKED');
    await unblockUser(bo, u.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('ENABLED');
    const a = await audits('USER_UNBLOCKED', u.id);
    expect(a[0]).toMatchObject({ actorId: bo.id, after: { status: 'ENABLED' } });
    expect(
      await db.notification.count({ where: { userId: u.id, kind: 'ACCOUNT_UNBLOCKED' } }),
    ).toBe(1);
    expect(mailer().sent.map((m) => m.to)).toEqual([u.email]);
    await expect(unblockUser(bo, u.id)).rejects.toBeInstanceOf(InvalidTransitionError);
  });
});

describe('listUsersForReview', () => {
  it('orders IN_REVIEW, CORRECTIONS_REQUESTED, PENDING, then the rest; FIFO by submission in each group (never-submitted last, then newest first); never BACKOFFICE', async () => {
    const t = `${tag}lst`;
    const hourAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
    const mk = async (status: UserStatus, submittedAt: Date | null = null) => {
      const u = await createTestUser(t, 'SELLER', status);
      await db.verificationCase.update({ where: { id: u.caseId ?? '' }, data: { submittedAt } });
      // Distinct, increasing updatedAt.
      await new Promise((r) => setTimeout(r, 5));
      await db.user.update({ where: { id: u.id }, data: { updatedAt: new Date() } });
      return u.id;
    };
    const enabled = await mk('ENABLED');
    const pending = await mk('PENDING');
    const reviewFirst = await mk('IN_REVIEW', hourAgo(3));
    const corrections = await mk('CORRECTIONS_REQUESTED', hourAgo(5));
    const rejected = await mk('REJECTED');
    const reviewNoDate = await mk('IN_REVIEW');
    const reviewSecond = await mk('IN_REVIEW', hourAgo(1));
    await createTestUser(t, 'BACKOFFICE', 'ENABLED');

    const { items, total } = await listUsersForReview(bo, { q: t });
    expect(total).toBe(7);
    expect(items.map((i) => i.id)).toEqual([
      reviewFirst,
      reviewSecond,
      reviewNoDate,
      corrections,
      pending,
      rejected,
      enabled,
    ]);
    expect(items.every((i) => i.role !== ('BACKOFFICE' as string))).toBe(true);

    const filtered = await listUsersForReview(bo, { q: t, status: 'IN_REVIEW' });
    expect(filtered.items.map((i) => i.id)).toEqual([reviewFirst, reviewSecond, reviewNoDate]);
    expect((await listUsersForReview(bo, { q: t, role: 'BUYER' })).total).toBe(0);
  });

  it('q matches name, email and organization name case-insensitively; docs counts required vs delivered', async () => {
    const t = `${tag}q`;
    const u = await createTestUser(t, 'SELLER');
    await saveStep(u.id, 3, SELLER_STEPS[3]);
    await uploadVerificationDocument(u.id, 'NATIONAL_ID', pdf());
    const { id: rutId } = await uploadVerificationDocument(u.id, 'RUT', pdf());
    await db.verificationDocument.update({
      where: { id: rutId },
      data: { reviewStatus: 'REJECTED' },
    });
    const org = await db.organization.create({
      data: {
        name: `Inversiones Quindío ${tag}`,
        nit: `${Date.now()}`,
        kind: 'COMPANY',
      },
    });
    await db.user.update({
      where: { id: u.id },
      data: { organizationId: org.id, name: `Mariana Zuluaga ${tag}` },
    });

    const byOrg = await listUsersForReview(bo, { q: `inversiones quindío ${tag}`.toUpperCase() });
    expect(byOrg.items.map((i) => i.id)).toEqual([u.id]);
    expect(byOrg.items[0]).toMatchObject({
      role: 'SELLER',
      status: 'PENDING',
      organizationName: `Inversiones Quindío ${tag}`,
      docs: { delivered: 1, required: 3 },
    });
    expect((await listUsersForReview(bo, { q: `mariana zuluaga ${tag}` })).total).toBe(1);
    expect((await listUsersForReview(bo, { q: u.email.toUpperCase() })).total).toBe(1);
    // LIKE wildcards in q are literals.
    expect((await listUsersForReview(bo, { q: `${tag}%` })).total).toBe(0);
  });

  it('pages 20 at a time', async () => {
    const t = `${tag}pg`;
    for (let i = 0; i < 21; i++) await createTestUser(t, 'BUYER');
    const p1 = await listUsersForReview(bo, { q: t, page: 1 });
    const p2 = await listUsersForReview(bo, { q: t, page: 2 });
    expect(p1.total).toBe(21);
    expect(p1.items).toHaveLength(20);
    expect(p2.items).toHaveLength(1);
  });
});

describe('getUserReview', () => {
  it('returns profile, case, documents without storage keys, checklist and audit history', async () => {
    const u = await inReviewSeller();
    const doc = await db.verificationDocument.findFirstOrThrow({
      where: { verificationCaseId: u.caseId, type: 'RUT' },
    });
    await reviewDocument(bo, doc.id, 'APPROVED');
    // Not onboarding activity: a login and a (future M4) data-room download by the applicant.
    await audited(async () => ({
      result: undefined,
      audit: { actorId: u.id, action: 'LOGIN_SUCCEEDED', entity: 'User', entityId: u.id },
    }));
    await audited(async () => ({
      result: undefined,
      audit: {
        actorId: u.id,
        action: 'DOCUMENT_DOWNLOADED',
        entity: 'Document',
        entityId: randomUUID(),
      },
    }));
    await runKycScreening(bo, u.id);

    const r = await getUserReview(bo, u.id);
    expect(r.user).toMatchObject({ id: u.id, role: 'SELLER', status: 'IN_REVIEW' });
    expect(r.case).toMatchObject({ id: u.caseId, status: 'IN_REVIEW' });
    expect(r.requiredDocuments).toEqual(['NATIONAL_ID', 'CHAMBER_OF_COMMERCE', 'RUT']);
    expect(r.documents).toHaveLength(3);
    expect(JSON.stringify(r)).not.toContain('verification/');
    expect(r.documents.find((d) => d.id === doc.id)).toMatchObject({
      reviewStatus: 'APPROVED',
      label: 'RUT',
    });
    expect(r.checklist).toHaveLength(DEFAULT_KYC_CHECKLIST.length);
    expect(r.checklist.find((i) => i.done)).toMatchObject({
      checkedByName: 'Revisora Back Office',
    });

    const actions = r.history.map((h) => h.action);
    expect(actions[0]).toBe('KYC_SCREENING_RUN');
    expect(actions).toContain('VERIFICATION_DOCUMENT_REVIEWED');
    expect(actions).toContain('ONBOARDING_SUBMITTED');
    expect(actions).toContain('VERIFICATION_DOCUMENT_UPLOADED');
    expect(actions).toContain('ONBOARDING_STEP_SAVED');
    expect(actions).not.toContain('LOGIN_SUCCEEDED');
    expect(actions).not.toContain('DOCUMENT_DOWNLOADED');
    expect(r.history[0]).toMatchObject({ actorName: 'Revisora Back Office' });
    expect(r.history[0]?.at).toBeInstanceOf(Date);
    const times = r.history.map((h) => h.at.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('a BACKOFFICE account or unknown id is not reviewable → NotFoundError', async () => {
    await expect(getUserReview(bo, bo.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getUserReview(bo, 'no-existe')).rejects.toBeInstanceOf(NotFoundError);
  });
});
