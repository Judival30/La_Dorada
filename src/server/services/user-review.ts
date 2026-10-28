import { Prisma, type VerificationCaseStatus } from '@prisma/client';
import { z } from 'zod';
import {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  ValidationError,
} from '@/domain/errors';
import { USER_STATUSES, userMachine, type UserStatus } from '@/domain/machines/user';
import {
  DOCUMENT_LABELS,
  onboardingProgress,
  requiredDocuments,
  type BuyerType,
  type OnboardingRole,
  type ProfileData,
  type ReviewStatus,
  type VerificationDocumentType,
} from '@/domain/onboarding';
import { assertRole } from '@/domain/policies/roles';
import type { AuditAction } from '@/server/audit/actions';
import { audited } from '@/server/audit/audited';
import { invalidateUserSessions, type SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { getKycProvider, type KycScreeningResult } from '@/server/kyc';
import { notify, sendTemplatedEmail, type NotificationKind } from '@/server/notify/notify';
import { latestCase, lockUser, readProfile, type LockedUser } from './onboarding';

export type { KycScreeningResult } from '@/server/kyc';

/**
 * Back Office user review (M2 Task 6): queue, applicant detail, document
 * review, KYC checklist + screening, decisions and block / unblock.
 *
 * Authorization: every function takes the acting `SessionUser` and first runs
 * `assertRole(actor, 'BACKOFFICE')`, so only an ENABLED BACKOFFICE gets past.
 * Targets are BUYER / SELLER only: a BACKOFFICE account is never listed or
 * reviewable (`NotFoundError`) and never blockable (`ForbiddenError`), and an
 * actor can never act on themselves (`ForbiddenError`).
 *
 * Concurrency: every mutation locks the target user row (`SELECT … FOR UPDATE`,
 * `lockUser`) before reading the state it checks, so two reviewers deciding at
 * once are serialized and the second sees the new status → the `userMachine`
 * transition throws `InvalidTransitionError`.
 *
 * Review-time edits (`reviewDocument`, `toggleKycItem`, `runKycScreening`) are
 * only allowed while the user is IN_REVIEW. Otherwise they throw
 * `InvalidTransitionError` (HTTP 409 "no disponible en el estado actual"): the
 * actor IS allowed to review, the target's state just does not admit it, which
 * is the same semantics the user machine uses for decisions.
 *
 * Data minimization: audit payloads carry ids, types and states only; the
 * correction notes, rejection and block reasons never reach the AuditLog.
 */

export const REVIEW_PAGE_SIZE = 20;
export const HISTORY_LIMIT = 50;
/** Label prefix of the checklist item the screening fills (see DEFAULT_KYC_CHECKLIST). */
export const SCREENING_ITEM_PREFIX = 'Consulta en listas restrictivas';

export type ReviewableRole = OnboardingRole;

export type UserReviewRow = {
  id: string;
  name: string;
  email: string;
  role: ReviewableRole;
  status: UserStatus;
  organizationName: string | null;
  docs: { delivered: number; required: number };
  updatedAt: Date;
};

export type UserReviewDocument = {
  id: string;
  type: VerificationDocumentType;
  label: string;
  reviewStatus: ReviewStatus;
  mime: string;
  size: number;
  originalName: string | null;
  createdAt: Date;
};

export type UserReviewChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  checkedByName: string | null;
  checkedAt: Date | null;
};

export type UserReviewHistoryEntry = { at: Date; action: string; actorName: string | null };

export type UserReviewDetail = {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: ReviewableRole;
    status: UserStatus;
    organizationName: string | null;
    consentAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  case: {
    id: string;
    status: VerificationCaseStatus;
    step: number;
    profile: Partial<ProfileData>;
    isLegalRepresentative: boolean | null;
    buyerType: BuyerType | null;
    submittedAt: Date | null;
    decidedAt: Date | null;
    decidedByName: string | null;
    correctionNotes: string | null;
    rejectionReason: string | null;
  } | null;
  requiredDocuments: VerificationDocumentType[];
  /** No storage keys or URLs: the UI links to the audited document GET route. */
  documents: UserReviewDocument[];
  checklist: UserReviewChecklistItem[];
  progress: ReturnType<typeof onboardingProgress> | null;
  /** At most `HISTORY_LIMIT` audit rows about the user, newest first. */
  history: UserReviewHistoryEntry[];
};

export type ReviewDecision =
  | { kind: 'APPROVE' }
  | { kind: 'REQUEST_CORRECTIONS'; notes: string }
  | { kind: 'REJECT'; reason: string };

// ───────────────────────────── validation ─────────────────────────────

const longText = (field: string) =>
  z
    .string({ error: `Escribe ${field}.` })
    .trim()
    .min(10, { error: `${capitalize(field)} debe tener al menos 10 caracteres.` })
    .max(1000, { error: `${capitalize(field)} no puede superar 1000 caracteres.` });

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const notesSchema = longText('las observaciones');
const reasonSchema = longText('el motivo');

const decisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('APPROVE') }),
  z.object({ kind: z.literal('REQUEST_CORRECTIONS'), notes: notesSchema }),
  z.object({ kind: z.literal('REJECT'), reason: reasonSchema }),
]);

const filterSchema = z.object({
  role: z.enum(['BUYER', 'SELLER']).optional(),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
});

const reviewStatusSchema = z.enum(['APPROVED', 'REJECTED']);

/** Parses with `schema`; a failure becomes a `ValidationError` with the first message (es-CO). */
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new ValidationError(r.error.issues[0]?.message ?? 'Revisa los datos ingresados.');
  }
  return r.data;
}

// ───────────────────────────── helpers ─────────────────────────────

function assertBackoffice(actor: SessionUser): void {
  assertRole(actor, 'BACKOFFICE');
}

function assertNotSelf(actor: SessionUser, userId: string): void {
  if (actor.id === userId) throw new ForbiddenError('A reviewer cannot act on their own account');
}

/** BACKOFFICE accounts are not part of the review flow. */
function reviewableRole(user: LockedUser): ReviewableRole {
  if (user.role === 'BACKOFFICE') throw new NotFoundError('User not found');
  return user.role;
}

function assertInReview(user: LockedUser, operation: string): void {
  if (user.status !== 'IN_REVIEW') {
    throw new InvalidTransitionError('userReview', user.status, operation);
  }
}

/** Display organization: the linked Organization, else the name typed in the wizard. */
function organizationNameOf(
  orgName: string | null | undefined,
  profile: Prisma.JsonValue | null | undefined,
): string | null {
  if (orgName) return orgName;
  const p = readProfile(profile ?? null) as {
    step3?: { entityName?: unknown };
    step4?: { legalName?: unknown };
  };
  const legal = p.step4?.legalName;
  if (typeof legal === 'string' && legal) return legal;
  const entity = p.step3?.entityName;
  return typeof entity === 'string' && entity ? entity : null;
}

function requiredFor(
  role: ReviewableRole,
  vc: { isLegalRepresentative: boolean | null; buyerType: BuyerType | null } | null | undefined,
): VerificationDocumentType[] {
  return requiredDocuments({
    role,
    isLegalRepresentative: vc?.isLegalRepresentative ?? null,
    buyerType: vc?.buyerType ?? null,
  });
}

/** Escapes LIKE wildcards so `q` matches literally. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// ───────────────────────────── reads ─────────────────────────────

/**
 * Review queue: BUYER / SELLER accounts only (never BACKOFFICE), optionally
 * filtered by role, status and `q` (case-insensitive, matched against the
 * name, email, linked organization name and the company / entity name typed in
 * the wizard). Ordered IN_REVIEW, CORRECTIONS_REQUESTED, PENDING, then the
 * rest; `updatedAt` descending inside each group. Pages of `REVIEW_PAGE_SIZE`.
 * `docs.delivered` counts the required types with a non-REJECTED document.
 */
export async function listUsersForReview(
  actor: SessionUser,
  filter: { role?: ReviewableRole; status?: UserStatus; q?: string; page?: number } = {},
): Promise<{ items: UserReviewRow[]; total: number }> {
  assertBackoffice(actor);
  const f = parseOrThrow(filterSchema, filter);
  const page = f.page ?? 1;

  const conditions: Prisma.Sql[] = [Prisma.sql`u.role IN ('BUYER', 'SELLER')`];
  if (f.role) conditions.push(Prisma.sql`u.role::text = ${f.role}`);
  if (f.status) conditions.push(Prisma.sql`u.status::text = ${f.status}`);
  if (f.q) {
    const p = likePattern(f.q);
    conditions.push(Prisma.sql`(
      u.name ILIKE ${p} OR u.email ILIKE ${p} OR o.name ILIKE ${p}
      OR c.profile -> 'step4' ->> 'legalName' ILIKE ${p}
      OR c.profile -> 'step3' ->> 'entityName' ILIKE ${p}
    )`);
  }
  const where = Prisma.join(conditions, ' AND ');
  const from = Prisma.sql`
    FROM "User" u
    LEFT JOIN "Organization" o ON o.id = u."organizationId"
    LEFT JOIN LATERAL (
      SELECT vc.profile FROM "VerificationCase" vc
      WHERE vc."userId" = u.id
      ORDER BY vc."createdAt" DESC, vc.id DESC
      LIMIT 1
    ) c ON true
    WHERE ${where}`;

  const [countRows, idRows] = await Promise.all([
    db.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*)::bigint AS total ${from}`,
    db.$queryRaw<{ id: string }[]>`
      SELECT u.id ${from}
      ORDER BY CASE u.status
          WHEN 'IN_REVIEW' THEN 0
          WHEN 'CORRECTIONS_REQUESTED' THEN 1
          WHEN 'PENDING' THEN 2
          ELSE 3
        END,
        u."updatedAt" DESC, u.id
      LIMIT ${REVIEW_PAGE_SIZE} OFFSET ${(page - 1) * REVIEW_PAGE_SIZE}`,
  ]);
  const total = Number(countRows[0]?.total ?? 0);
  const ids = idRows.map((r) => r.id);
  if (ids.length === 0) return { items: [], total };

  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      updatedAt: true,
      organization: { select: { name: true } },
      verificationCases: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          profile: true,
          isLegalRepresentative: true,
          buyerType: true,
          documents: { select: { type: true, reviewStatus: true } },
        },
      },
    },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const items: UserReviewRow[] = [];
  for (const id of ids) {
    const u = byId.get(id);
    if (!u || u.role === 'BACKOFFICE') continue;
    const vc = u.verificationCases[0];
    const required = requiredFor(u.role, vc);
    const delivered = required.filter((type) =>
      (vc?.documents ?? []).some((d) => d.type === type && d.reviewStatus !== 'REJECTED'),
    ).length;
    items.push({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      organizationName: organizationNameOf(u.organization?.name, vc?.profile),
      docs: { delivered, required: required.length },
      updatedAt: u.updatedAt,
    });
  }
  return { items, total };
}

/**
 * Everything the reviewer sees for one applicant: profile, latest case,
 * documents (metadata only, no storage key / URL), KYC checklist, progress and
 * the last `HISTORY_LIMIT` audit rows about them (entity = the user, actor =
 * the user, or entity = one of their cases, documents or checklist items),
 * newest first. BACKOFFICE or unknown id → `NotFoundError`.
 */
export async function getUserReview(actor: SessionUser, userId: string): Promise<UserReviewDetail> {
  assertBackoffice(actor);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      consentAt: true,
      createdAt: true,
      updatedAt: true,
      organization: { select: { name: true } },
      buyerPreferences: { select: { id: true } },
      verificationCases: { select: { id: true } },
    },
  });
  if (!user || user.role === 'BACKOFFICE') throw new NotFoundError('User not found');
  const role = user.role;

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
          mime: true,
          size: true,
          originalName: true,
          createdAt: true,
        },
      },
      checklist: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { checkedBy: { select: { name: true } } },
      },
    },
  });

  const caseIds = user.verificationCases.map((c) => c.id);
  const [docIds, itemIds] = await Promise.all([
    db.verificationDocument.findMany({
      where: { verificationCaseId: { in: caseIds } },
      select: { id: true },
    }),
    db.kycChecklistItem.findMany({
      where: { verificationCaseId: { in: caseIds } },
      select: { id: true },
    }),
  ]);
  const relatedIds = [userId, ...caseIds, ...docIds.map((d) => d.id), ...itemIds.map((i) => i.id)];
  const rows = await db.auditLog.findMany({
    where: { OR: [{ entityId: { in: relatedIds } }, { actorId: userId }] },
    orderBy: { seq: 'desc' },
    take: HISTORY_LIMIT,
    select: { at: true, action: true, actorId: true },
  });
  const actorIds = [
    ...new Set([...rows.map((r) => r.actorId), vc?.decidedById].filter((x): x is string => !!x)),
  ];
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(actors.map((a) => [a.id, a.name]));

  const progress = vc
    ? onboardingProgress({
        role,
        profile: readProfile(vc.profile),
        isLegalRepresentative: vc.isLegalRepresentative,
        buyerType: vc.buyerType,
        hasPreferences: user.buyerPreferences !== null,
        documents: vc.documents,
      })
    : null;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role,
      status: user.status,
      organizationName: organizationNameOf(user.organization?.name, vc?.profile),
      consentAt: user.consentAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    case: vc
      ? {
          id: vc.id,
          status: vc.status,
          step: vc.step,
          profile: readProfile(vc.profile),
          isLegalRepresentative: vc.isLegalRepresentative,
          buyerType: vc.buyerType,
          submittedAt: vc.submittedAt,
          decidedAt: vc.decidedAt,
          decidedByName: vc.decidedById ? (nameOf.get(vc.decidedById) ?? null) : null,
          correctionNotes: vc.correctionNotes,
          rejectionReason: vc.rejectionReason,
        }
      : null,
    requiredDocuments: requiredFor(role, vc),
    documents: (vc?.documents ?? []).map((d) => ({ ...d, label: DOCUMENT_LABELS[d.type] })),
    checklist: (vc?.checklist ?? []).map((i) => ({
      id: i.id,
      label: i.label,
      done: i.done,
      checkedByName: i.checkedBy?.name ?? null,
      checkedAt: i.checkedAt,
    })),
    progress,
    history: rows.map((r) => ({
      at: r.at,
      action: r.action,
      actorName: r.actorId ? (nameOf.get(r.actorId) ?? null) : null,
    })),
  };
}

// ───────────────────────────── review-time edits ─────────────────────────────

/**
 * Marks a document of the user's latest case APPROVED or REJECTED. Only while
 * the user is IN_REVIEW (else `InvalidTransitionError`). Unknown document, or
 * one from an older case → `NotFoundError`.
 */
export async function reviewDocument(
  actor: SessionUser,
  documentId: string,
  status: 'APPROVED' | 'REJECTED',
): Promise<void> {
  assertBackoffice(actor);
  const reviewStatus = parseOrThrow(reviewStatusSchema, status);
  const owner = await db.verificationDocument.findUnique({
    where: { id: documentId },
    select: { verificationCase: { select: { userId: true } } },
  });
  if (!owner) throw new NotFoundError('Document not found');
  const userId = owner.verificationCase.userId;
  assertNotSelf(actor, userId);

  await audited(async (tx) => {
    const user = await lockUser(tx, userId);
    reviewableRole(user);
    assertInReview(user, 'REVIEW_DOCUMENT');
    const vc = await latestCase(tx, userId);
    const doc = await tx.verificationDocument.findFirst({
      where: { id: documentId, verificationCaseId: vc.id },
      select: { id: true, type: true, reviewStatus: true },
    });
    if (!doc) throw new NotFoundError('Document not found');
    await tx.verificationDocument.update({ where: { id: doc.id }, data: { reviewStatus } });
    return {
      result: undefined,
      audit: {
        actorId: actor.id,
        action: 'VERIFICATION_DOCUMENT_REVIEWED',
        entity: 'VerificationDocument',
        entityId: doc.id,
        before: { reviewStatus: doc.reviewStatus },
        after: { documentId: doc.id, caseId: vc.id, type: doc.type, reviewStatus },
      },
    };
  });
}

/**
 * Checks / unchecks a KYC item of the user's latest case, recording who and
 * when (cleared on uncheck). Only while the user is IN_REVIEW.
 */
export async function toggleKycItem(
  actor: SessionUser,
  itemId: string,
  done: boolean,
): Promise<void> {
  assertBackoffice(actor);
  const value = parseOrThrow(z.boolean(), done);
  const owner = await db.kycChecklistItem.findUnique({
    where: { id: itemId },
    select: { verificationCase: { select: { userId: true } } },
  });
  if (!owner) throw new NotFoundError('Checklist item not found');
  const userId = owner.verificationCase.userId;
  assertNotSelf(actor, userId);

  await audited(async (tx) => {
    const user = await lockUser(tx, userId);
    reviewableRole(user);
    assertInReview(user, 'TOGGLE_KYC_ITEM');
    const vc = await latestCase(tx, userId);
    const item = await tx.kycChecklistItem.findFirst({
      where: { id: itemId, verificationCaseId: vc.id },
      select: { id: true },
    });
    if (!item) throw new NotFoundError('Checklist item not found');
    await tx.kycChecklistItem.update({
      where: { id: item.id },
      data: value
        ? { done: true, checkedById: actor.id, checkedAt: new Date() }
        : { done: false, checkedById: null, checkedAt: null },
    });
    return {
      result: undefined,
      audit: {
        actorId: actor.id,
        action: 'KYC_ITEM_CHECKED',
        entity: 'KycChecklistItem',
        entityId: item.id,
        after: { itemId: item.id, caseId: vc.id, done: value },
      },
    };
  });
}

/**
 * Screens the applicant against restrictive lists through the KYC provider
 * (the mock in M2, called before the transaction: it is external I/O). With no
 * matches, the checklist item whose label starts with `SCREENING_ITEM_PREFIX`
 * is marked done by the actor; with matches it is left unchecked for manual
 * review. Audited as `KYC_SCREENING_RUN` (provider and match count only).
 */
export async function runKycScreening(
  actor: SessionUser,
  userId: string,
): Promise<KycScreeningResult> {
  assertBackoffice(actor);
  assertNotSelf(actor, userId);
  const subject = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true, status: true },
  });
  if (!subject || subject.role === 'BACKOFFICE') throw new NotFoundError('User not found');
  // Early check so a non-reviewable user is never sent to the provider; re-checked under the lock.
  if (subject.status !== 'IN_REVIEW') {
    throw new InvalidTransitionError('userReview', subject.status, 'RUN_KYC_SCREENING');
  }

  const result = await getKycProvider().screen({
    name: subject.name,
    documentType: 'NATIONAL_ID',
  });

  await audited(async (tx) => {
    const user = await lockUser(tx, userId);
    reviewableRole(user);
    assertInReview(user, 'RUN_KYC_SCREENING');
    const vc = await latestCase(tx, userId);
    const item = await tx.kycChecklistItem.findFirst({
      where: { verificationCaseId: vc.id, label: { startsWith: SCREENING_ITEM_PREFIX } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!item) {
      throw new ValidationError('El caso no tiene el ítem de consulta en listas restrictivas.');
    }
    if (result.matches.length === 0) {
      await tx.kycChecklistItem.update({
        where: { id: item.id },
        data: { done: true, checkedById: actor.id, checkedAt: result.checkedAt },
      });
    }
    return {
      result: undefined,
      audit: {
        actorId: actor.id,
        action: 'KYC_SCREENING_RUN',
        entity: 'VerificationCase',
        entityId: vc.id,
        after: {
          caseId: vc.id,
          itemId: item.id,
          provider: result.provider,
          matchCount: result.matches.length,
        },
      },
    };
  });
  return result;
}

// ───────────────────────────── decisions ─────────────────────────────

const DECISION: Record<
  ReviewDecision['kind'],
  {
    event: 'APPROVE' | 'REQUEST_CORRECTIONS' | 'REJECT';
    caseStatus: VerificationCaseStatus;
    action: AuditAction;
    notification: NotificationKind;
  }
> = {
  APPROVE: {
    event: 'APPROVE',
    caseStatus: 'APPROVED',
    action: 'USER_APPROVED',
    notification: 'ONBOARDING_APPROVED',
  },
  REQUEST_CORRECTIONS: {
    event: 'REQUEST_CORRECTIONS',
    caseStatus: 'CORRECTIONS_REQUESTED',
    action: 'USER_CORRECTIONS_REQUESTED',
    notification: 'ONBOARDING_CORRECTIONS',
  },
  REJECT: {
    event: 'REJECT',
    caseStatus: 'REJECTED',
    action: 'USER_REJECTED',
    notification: 'ONBOARDING_REJECTED',
  },
};

/**
 * Decides an IN_REVIEW applicant. Notes / reason are trimmed and must be
 * 10–1000 characters (`ValidationError`). Under the user lock: `userMachine`
 * transition first (a user no longer IN_REVIEW → `InvalidTransitionError`, so
 * of two concurrent decisions exactly one wins); APPROVE additionally needs
 * every KYC item done and every required document APPROVED, else
 * `ValidationError` listing what is missing, one per line. Then the latest
 * case gets the outcome, `decidedAt` / `decidedById` and the notes / reason
 * (APPROVE clears `correctionNotes`). On REQUEST_CORRECTIONS the REJECTED
 * documents stay REJECTED: the applicant re-uploads them. In-app notification
 * in the transaction; audit `{ caseId, decision }` (never the text); email
 * after commit.
 */
export async function decideUser(
  actor: SessionUser,
  userId: string,
  decision: ReviewDecision,
): Promise<void> {
  assertBackoffice(actor);
  assertNotSelf(actor, userId);
  const d = parseOrThrow(decisionSchema, decision);
  const spec = DECISION[d.kind];

  const mail = await audited(async (tx) => {
    const user = await lockUser(tx, userId);
    const role = reviewableRole(user);
    const next = userMachine.transition(user.status, spec.event, actor.role);

    const vc = await tx.verificationCase.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        documents: { select: { type: true, reviewStatus: true } },
        checklist: { orderBy: { createdAt: 'asc' }, select: { label: true, done: true } },
      },
    });
    if (!vc) throw new NotFoundError('Verification case not found');

    if (d.kind === 'APPROVE') {
      if (vc.checklist.length === 0) {
        throw new ValidationError('El caso no tiene checklist KYC; no se puede aprobar.');
      }
      const missing: string[] = [];
      for (const item of vc.checklist) {
        if (!item.done) missing.push(`Falta completar en el checklist KYC: ${item.label}.`);
      }
      for (const type of requiredFor(role, vc)) {
        if (!vc.documents.some((doc) => doc.type === type && doc.reviewStatus === 'APPROVED')) {
          missing.push(`Falta aprobar el documento: ${DOCUMENT_LABELS[type]}.`);
        }
      }
      if (missing.length > 0) {
        throw new ValidationError(`No es posible aprobar todavía:\n${missing.join('\n')}`);
      }
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { status: next },
      select: { email: true, name: true },
    });
    await tx.verificationCase.update({
      where: { id: vc.id },
      data: {
        status: spec.caseStatus,
        decidedAt: new Date(),
        decidedById: actor.id,
        ...(d.kind === 'APPROVE' ? { correctionNotes: null } : {}),
        ...(d.kind === 'REQUEST_CORRECTIONS' ? { correctionNotes: d.notes } : {}),
        ...(d.kind === 'REJECT' ? { rejectionReason: d.reason } : {}),
      },
    });
    await notify(tx, { userId, kind: spec.notification, payload: { caseId: vc.id } });

    return {
      result: { to: updated.email, name: updated.name },
      audit: {
        actorId: actor.id,
        action: spec.action,
        entity: 'User',
        entityId: userId,
        before: { status: user.status },
        after: { caseId: vc.id, decision: d.kind },
      },
    };
  });

  await sendTemplatedEmail(mail.to, spec.notification, { name: mail.name });
}

/**
 * Blocks an ENABLED BUYER / SELLER (`userMachine` BLOCK). The reason (10–1000
 * characters) goes to the user's in-app notification only, never the audit.
 * Every session of the user is deleted inside the same transaction, so a
 * rollback keeps them and a commit logs the user out everywhere at once.
 */
export async function blockUser(actor: SessionUser, userId: string, reason: string): Promise<void> {
  assertBackoffice(actor);
  assertNotSelf(actor, userId);
  const why = parseOrThrow(reasonSchema, reason);
  await changeBlockState(actor, userId, 'BLOCK', why);
}

/** Unblocks a BLOCKED BUYER / SELLER (`userMachine` UNBLOCK → ENABLED). */
export async function unblockUser(actor: SessionUser, userId: string): Promise<void> {
  assertBackoffice(actor);
  assertNotSelf(actor, userId);
  await changeBlockState(actor, userId, 'UNBLOCK', null);
}

async function changeBlockState(
  actor: SessionUser,
  userId: string,
  event: 'BLOCK' | 'UNBLOCK',
  reason: string | null,
): Promise<void> {
  const kind: NotificationKind = event === 'BLOCK' ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_UNBLOCKED';
  const mail = await audited(async (tx) => {
    const user = await lockUser(tx, userId);
    if (user.role === 'BACKOFFICE') {
      throw new ForbiddenError('Back Office accounts cannot be blocked from the review flow');
    }
    const next = userMachine.transition(user.status, event, actor.role);
    const updated = await tx.user.update({
      where: { id: userId },
      data: { status: next },
      select: { email: true, name: true },
    });
    if (event === 'BLOCK') await invalidateUserSessions(userId, { tx });
    await notify(tx, { userId, kind, payload: reason ? { reason } : {} });
    return {
      result: { to: updated.email, name: updated.name },
      audit: {
        actorId: actor.id,
        action: event === 'BLOCK' ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
        entity: 'User',
        entityId: userId,
        before: { status: user.status },
        after: { status: next },
      },
    };
  });
  await sendTemplatedEmail(mail.to, kind, { name: mail.name });
}
