import { randomUUID } from 'node:crypto';
import type { Prisma, VerificationCaseStatus } from '@prisma/client';
import { z } from 'zod';
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors';
import { userMachine, type UserStatus } from '@/domain/machines/user';
import { millions } from '@/domain/money';
import {
  DOCUMENT_LABELS,
  PROFILE_SCHEMAS,
  VERIFICATION_DOCUMENT_TYPES,
  onboardingProgress,
  type BuyerType,
  type OnboardingRole,
  type OnboardingSnapshot,
  type ProfileData,
  type ReviewStatus,
  type VerificationDocumentType,
} from '@/domain/onboarding';
import type { Role } from '@/domain/roles';
import { audited } from '@/server/audit/audited';
import type { SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { sanitizeFileName, sniffMime } from '@/server/files/sniff';
import { notify, sendTemplatedEmail, type NotificationKind } from '@/server/notify/notify';
import { getStorage } from '@/server/storage';

/**
 * Onboarding / accreditation service (M2 Task 4): wizard steps, verified
 * document uploads, owner/BACKOFFICE signed reads and submission for review.
 *
 * Concurrency: every mutation locks the user's row (`SELECT … FOR UPDATE`)
 * first, so step saves, uploads, deletes and the submission are serialized per
 * user and the status checked is the status committed.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Signed read URLs live 60 s (spec: never public, read only via short-lived URL). */
export const DOCUMENT_URL_TTL_SECONDS = 60;
/** Statuses in which the wizard (steps, uploads, deletes) is editable. */
export const EDITABLE_STATUSES: readonly UserStatus[] = ['PENDING', 'CORRECTIONS_REQUESTED'];

export type OnboardingDocumentView = {
  id: string;
  type: VerificationDocumentType;
  label: string;
  reviewStatus: ReviewStatus;
  size: number;
  createdAt: Date;
  originalName: string | null;
};

export type OnboardingView = {
  role: OnboardingRole;
  userStatus: UserStatus;
  caseId: string;
  caseStatus: VerificationCaseStatus;
  profile: Partial<ProfileData>;
  isLegalRepresentative: boolean | null;
  buyerType: BuyerType | null;
  documents: OnboardingDocumentView[];
  progress: ReturnType<typeof onboardingProgress>;
  correctionNotes: string | null;
  rejectionReason: string | null;
  submittedAt: Date | null;
};

type Client = Prisma.TransactionClient | typeof db;

// ───────────────────────────── helpers ─────────────────────────────

type LockedUser = { id: string; role: Role; status: UserStatus };

async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<LockedUser> {
  const rows = await tx.$queryRaw<LockedUser[]>`
    SELECT id, role::text AS role, status::text AS status
    FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const user = rows[0];
  if (!user) throw new NotFoundError('User not found');
  return user;
}

function onboardingRole(role: Role): OnboardingRole {
  if (role === 'BACKOFFICE') throw new ForbiddenError('This role has no onboarding');
  return role;
}

function assertEditable(status: UserStatus): void {
  if (!EDITABLE_STATUSES.includes(status)) {
    throw new ForbiddenError(`Onboarding is not editable while ${status}`);
  }
}

async function latestCase(client: Client, userId: string) {
  const vc = await client.verificationCase.findFirst({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  if (!vc) throw new NotFoundError('Verification case not found');
  return vc;
}

function readProfile(json: Prisma.JsonValue | null): Partial<ProfileData> {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return {};
  return { ...(json as Partial<ProfileData>) };
}

function snapshotOf(
  role: OnboardingRole,
  vc: {
    profile: Prisma.JsonValue | null;
    isLegalRepresentative: boolean | null;
    buyerType: BuyerType | null;
  },
  documents: { type: VerificationDocumentType; reviewStatus: ReviewStatus }[],
  hasPreferences: boolean,
): OnboardingSnapshot {
  return {
    role,
    profile: readProfile(vc.profile),
    isLegalRepresentative: vc.isLegalRepresentative,
    buyerType: vc.buyerType,
    hasPreferences,
    documents,
  };
}

/** Best-effort object deletion: S3 failures are logged (key only, no PII) and swallowed. */
async function deleteObjectQuietly(key: string, reason: string): Promise<void> {
  try {
    await getStorage().delete(key);
  } catch (err) {
    console.error(
      `[storage] could not delete ${reason} object ${key}:`,
      err instanceof Error ? err.name : 'UnknownError',
    );
  }
}

// ───────────────────────────── reads ─────────────────────────────

/** Wizard state from the user's most recent verification case. */
export async function getOnboardingState(userId: string): Promise<OnboardingView> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true, buyerPreferences: { select: { id: true } } },
  });
  if (!user) throw new NotFoundError('User not found');
  const role = onboardingRole(user.role);

  const vc = await db.verificationCase.findFirst({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      documents: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          reviewStatus: true,
          size: true,
          createdAt: true,
          originalName: true,
        },
      },
    },
  });
  if (!vc) throw new NotFoundError('Verification case not found');

  const snapshot = snapshotOf(role, vc, vc.documents, user.buyerPreferences !== null);
  return {
    role,
    userStatus: user.status,
    caseId: vc.id,
    caseStatus: vc.status,
    profile: snapshot.profile,
    isLegalRepresentative: vc.isLegalRepresentative,
    buyerType: vc.buyerType,
    documents: vc.documents.map((d) => ({ ...d, label: DOCUMENT_LABELS[d.type] })),
    progress: onboardingProgress(snapshot),
    correctionNotes: vc.correctionNotes,
    rejectionReason: vc.rejectionReason,
    submittedAt: vc.submittedAt,
  };
}

// ───────────────────────────── steps ─────────────────────────────

/**
 * Validates `data` with the step's `PROFILE_SCHEMAS` entry for the user's role
 * (throws `ZodError` → 422) and stores it as `profile.step<N>`, replacing that
 * step's previous value. Side effects that must stay in sync:
 * - step 1 → `User.name`, `User.phone`;
 * - step 3 → `VerificationCase.isLegalRepresentative` (seller) / `buyerType` (buyer),
 *   which `requiredDocuments` reads;
 * - step 4 buyer → upsert `BuyerPreferences` (millions → BigInt pesos).
 * Seller step 4 only lives in the profile (Organization/Company come in M3).
 * Department / regions membership in `DEPARTMENTS` is enforced by the domain schema.
 */
export async function saveStep(userId: string, step: 1 | 3 | 4, data: unknown): Promise<void> {
  if (step !== 1 && step !== 3 && step !== 4) throw new ValidationError('Paso inválido.');

  await audited(async (tx) => {
    const user = await lockUser(tx, userId);
    const role = onboardingRole(user.role);
    assertEditable(user.status);
    const vc = await latestCase(tx, userId);
    const profile = readProfile(vc.profile);
    const caseData: Prisma.VerificationCaseUpdateInput = {};

    if (step === 1) {
      const v = PROFILE_SCHEMAS.step1.parse(data);
      profile.step1 = v;
      await tx.user.update({ where: { id: userId }, data: { name: v.name, phone: v.phone } });
    } else if (step === 3) {
      if (role === 'SELLER') {
        const v = PROFILE_SCHEMAS.step3Seller.parse(data);
        profile.step3 = v;
        caseData.isLegalRepresentative = v.isLegalRepresentative;
      } else {
        const v = PROFILE_SCHEMAS.step3Buyer.parse(data);
        profile.step3 = v;
        caseData.buyerType = v.buyerType;
      }
    } else if (role === 'SELLER') {
      profile.step4 = PROFILE_SCHEMAS.step4Seller.parse(data);
    } else {
      const v = PROFILE_SCHEMAS.step4Buyer.parse(data);
      profile.step4 = v;
      const prefs = {
        sectors: v.sectors,
        regions: v.regions,
        ticketMin: millions(v.ticketMinMillions),
        ticketMax: millions(v.ticketMaxMillions),
      };
      await tx.buyerPreferences.upsert({
        where: { userId },
        create: { userId, ...prefs },
        update: prefs,
      });
    }

    await tx.verificationCase.update({
      where: { id: vc.id },
      data: {
        ...caseData,
        profile: profile as unknown as Prisma.InputJsonObject,
        step: Math.max(vc.step, step),
      },
    });
    return {
      result: undefined,
      audit: {
        actorId: userId,
        action: 'ONBOARDING_STEP_SAVED',
        entity: 'VerificationCase',
        entityId: vc.id,
        after: { step },
      },
    };
  });
}

// ───────────────────────────── documents ─────────────────────────────

const documentTypeSchema = z.enum(VERIFICATION_DOCUMENT_TYPES);

/**
 * Stores a PDF/JPEG/PNG (sniffed from the bytes, ≤ 10 MB) as the case's
 * document of `type`, replacing any previous one of that type.
 *
 * Order: validate → upload the object under a random key
 * `verification/<caseId>/<uuid>` → one audited transaction deletes the old row
 * and creates the new one → after commit, delete the old object (failures are
 * logged, never surfaced). If the transaction fails, the new object is deleted.
 */
export async function uploadVerificationDocument(
  userId: string,
  type: VerificationDocumentType,
  file: { name: string; bytes: Buffer },
): Promise<{ id: string }> {
  const parsedType = documentTypeSchema.safeParse(type);
  if (!parsedType.success) throw new ValidationError('Tipo de documento inválido.');
  const docType = parsedType.data;
  const size = file.bytes.length;
  if (size === 0) throw new ValidationError('El archivo está vacío.');
  if (size > MAX_DOCUMENT_BYTES) throw new ValidationError('El archivo supera el límite de 10 MB.');
  const mime = sniffMime(file.bytes);
  if (!mime) throw new ValidationError('Solo se aceptan archivos PDF, JPG o PNG.');
  const originalName = sanitizeFileName(file.name);

  // Pre-check (unlocked) so a forbidden user never writes to S3; re-checked under the lock.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });
  if (!user) throw new NotFoundError('User not found');
  onboardingRole(user.role);
  assertEditable(user.status);
  const vc = await latestCase(db, userId);

  const key = `verification/${vc.id}/${randomUUID()}`;
  await getStorage().put(key, file.bytes, mime);

  let outcome: { id: string; replacedKeys: string[] };
  try {
    outcome = await audited(async (tx) => {
      const locked = await lockUser(tx, userId);
      assertEditable(locked.status);
      const current = await latestCase(tx, userId);
      if (current.id !== vc.id) {
        throw new ValidationError(
          'Tu solicitud cambió mientras subías el archivo. Intenta de nuevo.',
        );
      }
      const previous = await tx.verificationDocument.findMany({
        where: { verificationCaseId: vc.id, type: docType },
        select: { id: true, storageKey: true },
      });
      if (previous.length > 0) {
        await tx.verificationDocument.deleteMany({
          where: { id: { in: previous.map((p) => p.id) } },
        });
      }
      const doc = await tx.verificationDocument.create({
        data: {
          verificationCaseId: vc.id,
          type: docType,
          storageKey: key,
          mime,
          size,
          originalName,
        },
        select: { id: true },
      });
      return {
        result: { id: doc.id, replacedKeys: previous.map((p) => p.storageKey) },
        audit: {
          actorId: userId,
          action: 'VERIFICATION_DOCUMENT_UPLOADED',
          entity: 'VerificationDocument',
          entityId: doc.id,
          after: {
            documentId: doc.id,
            caseId: vc.id,
            type: docType,
            mime,
            size,
            replacedDocumentId: previous[0]?.id,
          },
        },
      };
    });
  } catch (err) {
    await deleteObjectQuietly(key, 'orphaned');
    throw err;
  }

  for (const old of outcome.replacedKeys) await deleteObjectQuietly(old, 'replaced');
  return { id: outcome.id };
}

/**
 * Owner-only delete of a document of the user's latest case, while the wizard
 * is editable. Someone else's (or an unknown) document → `NotFoundError`, so
 * existence is not revealed. The object is deleted after commit (best effort).
 */
export async function deleteVerificationDocument(
  userId: string,
  documentId: string,
): Promise<void> {
  const key = await audited(async (tx) => {
    const user = await lockUser(tx, userId);
    const vc = await tx.verificationCase.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    const doc = vc
      ? await tx.verificationDocument.findFirst({
          where: { id: documentId, verificationCaseId: vc.id },
          select: { id: true, type: true, storageKey: true },
        })
      : null;
    if (!doc) throw new NotFoundError('Document not found');
    assertEditable(user.status);
    await tx.verificationDocument.delete({ where: { id: doc.id } });
    return {
      result: doc.storageKey,
      audit: {
        actorId: userId,
        action: 'VERIFICATION_DOCUMENT_DELETED',
        entity: 'VerificationDocument',
        entityId: doc.id,
        before: { documentId: doc.id, type: doc.type },
      },
    };
  });
  await deleteObjectQuietly(key, 'deleted');
}

/**
 * 60 s signed GET URL for the document's owner or an ENABLED BACKOFFICE user,
 * audited as `VERIFICATION_DOCUMENT_VIEWED`. Anyone else gets `NotFoundError`
 * (404, not 403): a stranger cannot tell a foreign document from a missing one.
 */
export async function documentReadUrl(actor: SessionUser, documentId: string): Promise<string> {
  const isBackoffice = actor.role === 'BACKOFFICE' && actor.status === 'ENABLED';
  const doc = await db.verificationDocument.findFirst({
    where: isBackoffice
      ? { id: documentId }
      : { id: documentId, verificationCase: { userId: actor.id } },
    select: { id: true, type: true, storageKey: true },
  });
  if (!doc) throw new NotFoundError('Document not found');

  await audited(async () => ({
    result: undefined,
    audit: {
      actorId: actor.id,
      action: 'VERIFICATION_DOCUMENT_VIEWED',
      entity: 'VerificationDocument',
      entityId: doc.id,
      after: { documentId: doc.id, type: doc.type },
    },
  }));
  return getStorage().presignGet(doc.storageKey, DOCUMENT_URL_TTL_SECONDS);
}

// ───────────────────────────── submission ─────────────────────────────

/**
 * Sends the onboarding to the Back Office queue. Under the user-row lock:
 * progress must allow it (else `ValidationError` listing every missing reason,
 * one per line), then `userMachine` SUBMIT (from PENDING) or RESUBMIT (from
 * CORRECTIONS_REQUESTED), case → IN_REVIEW with `submittedAt`, in-app
 * notifications to the user and every ENABLED BACKOFFICE (payload `{ userId }`),
 * audit `ONBOARDING_SUBMITTED`. Emails go out after commit.
 */
export async function submitForReview(userId: string): Promise<void> {
  const emails = await audited(async (tx) => {
    const user = await lockUser(tx, userId);
    const role = onboardingRole(user.role);

    const vc = await tx.verificationCase.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { documents: { select: { type: true, reviewStatus: true } } },
    });
    if (!vc) throw new NotFoundError('Verification case not found');
    const hasPreferences = (await tx.buyerPreferences.count({ where: { userId } })) > 0;

    const progress = onboardingProgress(snapshotOf(role, vc, vc.documents, hasPreferences));
    if (!progress.canSubmit) {
      throw new ValidationError(progress.missing.map((m) => m.reason).join('\n'));
    }

    const event = user.status === 'CORRECTIONS_REQUESTED' ? 'RESUBMIT' : 'SUBMIT';
    const next = userMachine.transition(user.status, event, role);

    const updated = await tx.user.update({
      where: { id: userId },
      data: { status: next },
      select: { email: true, name: true },
    });
    await tx.verificationCase.update({
      where: { id: vc.id },
      data: { status: 'IN_REVIEW', submittedAt: new Date(), step: 6 },
    });

    await notify(tx, { userId, kind: 'ONBOARDING_SUBMITTED', payload: { caseId: vc.id } });
    const reviewers = await tx.user.findMany({
      where: { role: 'BACKOFFICE', status: 'ENABLED' },
      select: { id: true, email: true, name: true },
    });
    for (const bo of reviewers) {
      await notify(tx, { userId: bo.id, kind: 'NEW_USER_TO_REVIEW', payload: { userId } });
    }

    const mail: { to: string; name: string; kind: NotificationKind }[] = [
      { to: updated.email, name: updated.name, kind: 'ONBOARDING_SUBMITTED' },
      ...reviewers.map((bo) => ({
        to: bo.email,
        name: bo.name,
        kind: 'NEW_USER_TO_REVIEW' as const,
      })),
    ];
    return {
      result: mail,
      audit: {
        actorId: userId,
        action: 'ONBOARDING_SUBMITTED',
        entity: 'User',
        entityId: userId,
        after: { caseId: vc.id },
      },
    };
  });

  // After commit; sendTemplatedEmail logs and swallows its own failures.
  await Promise.all(emails.map((m) => sendTemplatedEmail(m.to, m.kind, { name: m.name })));
}
