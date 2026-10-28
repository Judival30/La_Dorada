/**
 * Access requests, NDA and seller authorization (H10, H13 minimal).
 *
 * Every status change goes through `accessMachine` under a row lock
 * (`SELECT … FOR UPDATE` on the AccessRequest) inside `audited()`. The unique
 * (buyerId, opportunityId) constraint makes a double request fail cleanly.
 * Audit payloads carry ids and states only (never the purpose text).
 * In-app notifications are written in the transaction; emails go after commit.
 *
 * NDA renewal: an AUTHORIZED request whose NDA expired may sign a new NDA.
 * The machine has no event for it, so the status stays AUTHORIZED and only a
 * new `NdaSignature` row is added (still audited as `NDA_SIGNED`).
 */
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { NDA_TEXT, NDA_VERSION } from '@/content/nda';
import {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  ValidationError,
} from '@/domain/errors';
import { accessMachine, type AccessStatus } from '@/domain/machines/access';
import type { OpportunityStatus } from '@/domain/machines/opportunity';
import { OPPORTUNITY_TYPE_LABELS, type OpportunityType } from '@/domain/opportunity';
import {
  canAccessConfidential,
  ndaState,
  type NdaInfo,
  type NdaState,
} from '@/domain/policies/confidential';
import { isPartyConflict } from '@/domain/policies/parties';
import { computeRelevance } from '@/domain/relevance';
import { SECTOR_LABELS } from '@/domain/sectors';
import { signNdaDocument } from '@/server/adapters/esign/mock';
import { audited } from '@/server/audit/audited';
import type { SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { notify, sendTemplatedEmail, type NotificationKind } from '@/server/notify/notify';

type Actor = Pick<SessionUser, 'id' | 'role' | 'status'>;
type Email = { to: string; kind: NotificationKind; name: string };

export const PURPOSE_MIN = 20;
export const PURPOSE_MAX = 500;
const DUPLICATE_REQUEST = 'Ya tienes una solicitud de acceso para esta oportunidad.';

const purposeSchema = z.object({
  purpose: z
    .string()
    .trim()
    .min(PURPOSE_MIN, `Cuéntale al vendedor tu propósito en al menos ${PURPOSE_MIN} caracteres.`)
    .max(PURPOSE_MAX, `El propósito puede tener máximo ${PURPOSE_MAX} caracteres.`),
});

const idSchema = z.string().min(1).max(64);

export const BUYER_TYPE_LABEL: Record<string, string> = {
  FUND: 'Fondo de inversión',
  STRATEGIC: 'Comprador estratégico',
  FAMILY_OFFICE: 'Family office',
  ANGEL: 'Inversionista ángel',
};

function assertEnabled(actor: Actor, ...roles: Actor['role'][]): void {
  if (actor.status !== 'ENABLED' || !roles.includes(actor.role)) {
    throw new ForbiddenError('Role not allowed');
  }
}

function parseId(id: string): string {
  const p = idSchema.safeParse(id);
  if (!p.success) throw new NotFoundError();
  return p.data;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

async function sendAll(emails: Email[]): Promise<void> {
  for (const e of emails) await sendTemplatedEmail(e.to, e.kind, { name: e.name });
}

type LockedRequest = {
  id: string;
  buyerId: string;
  opportunityId: string;
  status: AccessStatus;
  sellerId: string;
  opportunityStatus: OpportunityStatus;
};

/** Locks the AccessRequest row (not the opportunity) and returns it with its opportunity's owner. */
async function lockRequest(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<LockedRequest | null> {
  const rows = await tx.$queryRaw<LockedRequest[]>`
    SELECT ar.id, ar."buyerId", ar."opportunityId", ar.status::text AS status,
           o."sellerId", o.status::text AS "opportunityStatus"
    FROM "AccessRequest" ar
    JOIN "Opportunity" o ON o.id = ar."opportunityId"
    WHERE ar.id = ${id}
    FOR UPDATE OF ar`;
  return rows[0] ?? null;
}

async function latestNda(
  tx: Prisma.TransactionClient,
  accessRequestId: string,
): Promise<NdaInfo | null> {
  return tx.ndaSignature.findFirst({
    where: { accessRequestId },
    orderBy: { signedAt: 'desc' },
    select: { signedAt: true, expiresAt: true },
  });
}

async function contactOf(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ email: string; name: string }> {
  return tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } });
}

// ───────────────────────────── buyer ─────────────────────────────

/**
 * BUYER (ENABLED) asks for access to a PUBLISHED opportunity. A seller can
 * never request (R9: role check + `isPartyConflict`). Relevance is computed
 * from the buyer's preferences. Notifies the seller.
 */
export async function requestAccess(
  actor: Actor,
  opportunityId: string,
  input: { purpose: string },
): Promise<{ id: string }> {
  assertEnabled(actor, 'BUYER');
  const parsed = purposeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Revisa el propósito.');
  }
  const opp = await db.opportunity.findUnique({
    where: { id: parseId(opportunityId) },
    select: {
      id: true,
      status: true,
      sellerId: true,
      dealSizeMin: true,
      dealSizeMax: true,
      company: { select: { sector: true, department: true } },
    },
  });
  if (!opp || opp.status !== 'PUBLISHED') throw new NotFoundError();
  if (isPartyConflict(actor.id, opp)) throw new ForbiddenError('Party conflict');

  const prefs = await db.buyerPreferences.findUnique({
    where: { userId: actor.id },
    select: { sectors: true, regions: true, ticketMin: true, ticketMax: true },
  });
  const relevance = computeRelevance(prefs, {
    sector: opp.company.sector,
    department: opp.company.department,
    dealSizeMin: opp.dealSizeMin,
    dealSizeMax: opp.dealSizeMax,
  });

  let out: { id: string; email: Email };
  try {
    out = await audited(async (tx) => {
      const existing = await tx.accessRequest.findUnique({
        where: { buyerId_opportunityId: { buyerId: actor.id, opportunityId: opp.id } },
        select: { id: true },
      });
      if (existing) throw new ValidationError(DUPLICATE_REQUEST);
      const ar = await tx.accessRequest.create({
        data: {
          buyerId: actor.id,
          opportunityId: opp.id,
          purpose: parsed.data.purpose,
          relevance,
          status: 'REQUESTED',
        },
        select: { id: true },
      });
      await notify(tx, {
        userId: opp.sellerId,
        kind: 'ACCESS_REQUESTED',
        payload: { accessRequestId: ar.id, opportunityId: opp.id },
      });
      const seller = await contactOf(tx, opp.sellerId);
      return {
        result: {
          id: ar.id,
          email: { to: seller.email, kind: 'ACCESS_REQUESTED', name: seller.name },
        },
        audit: {
          actorId: actor.id,
          action: 'ACCESS_REQUESTED',
          entity: 'AccessRequest',
          entityId: ar.id,
          after: { opportunityId: opp.id, status: 'REQUESTED', relevance },
        },
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ValidationError(DUPLICATE_REQUEST);
    throw err;
  }
  await sendAll([out.email]);
  return { id: out.id };
}

/**
 * Mock e-signature of the demo NDA by the requesting buyer: hash of the exact
 * text + ids + instant, valid 365 days, with IP / user agent as evidence.
 * REQUESTED → NDA_SIGNED (`SIGN_NDA`), or renewal of an expired NDA while AUTHORIZED.
 */
export async function signNda(
  actor: Actor,
  accessRequestId: string,
  ctx: { ip: string | null; userAgent: string | null },
  now: Date = new Date(),
): Promise<void> {
  assertEnabled(actor, 'BUYER');
  const id = parseId(accessRequestId);
  const emails = await audited(async (tx) => {
    const ar = await lockRequest(tx, id);
    if (!ar || ar.buyerId !== actor.id || ar.opportunityStatus !== 'PUBLISHED') {
      throw new NotFoundError();
    }
    let next: AccessStatus = ar.status;
    if (ar.status === 'AUTHORIZED') {
      if (ndaState(await latestNda(tx, ar.id), now) === 'SIGNED') {
        throw new InvalidTransitionError('access', ar.status, 'SIGN_NDA');
      }
    } else {
      next = accessMachine.transition(ar.status, 'SIGN_NDA', 'BUYER');
    }

    const sig = signNdaDocument({
      accessRequestId: ar.id,
      buyerId: ar.buyerId,
      opportunityId: ar.opportunityId,
      signedAt: now,
    });
    const row = await tx.ndaSignature.create({
      data: {
        accessRequestId: ar.id,
        documentHash: sig.documentHash,
        signedAt: sig.signedAt,
        expiresAt: sig.expiresAt,
        ip: ctx.ip?.slice(0, 64) ?? null,
        userAgent: ctx.userAgent?.slice(0, 512) ?? null,
      },
      select: { id: true },
    });
    if (next !== ar.status) {
      await tx.accessRequest.update({ where: { id: ar.id }, data: { status: next } });
    }
    await notify(tx, {
      userId: ar.sellerId,
      kind: 'NDA_SIGNED',
      payload: { accessRequestId: ar.id, opportunityId: ar.opportunityId },
    });
    const seller = await contactOf(tx, ar.sellerId);
    return {
      result: [{ to: seller.email, kind: 'NDA_SIGNED' as const, name: seller.name }],
      audit: {
        actorId: actor.id,
        action: 'NDA_SIGNED',
        entity: 'AccessRequest',
        entityId: ar.id,
        before: { status: ar.status },
        after: {
          status: next,
          opportunityId: ar.opportunityId,
          ndaSignatureId: row.id,
          documentHash: sig.documentHash,
          ndaVersion: NDA_VERSION,
          expiresAt: sig.expiresAt,
        },
        ip: ctx.ip,
      },
    };
  });
  await sendAll(emails);
}

export type BuyerAccessState = {
  opportunity: {
    id: string;
    title: string;
    sectorLabel: string;
    department: string;
    typeLabel: string;
  };
  request: { id: string; status: AccessStatus; purpose: string; createdAt: Date } | null;
  nda: { signedAt: Date; expiresAt: Date; state: NdaState; documentHash: string } | null;
  canOpenDataRoom: boolean;
  /** True when the next step is (re)signing the NDA. */
  needsSignature: boolean;
  ndaText: string;
  ndaVersion: string;
};

/** The buyer's view of their request on a PUBLISHED opportunity (404 otherwise). */
export async function getAccessState(
  actor: Actor,
  opportunityId: string,
  now: Date = new Date(),
): Promise<BuyerAccessState> {
  assertEnabled(actor, 'BUYER');
  const opp = await db.opportunity.findUnique({
    where: { id: parseId(opportunityId) },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      sellerId: true,
      company: { select: { sector: true, department: true } },
    },
  });
  if (!opp || opp.status !== 'PUBLISHED' || isPartyConflict(actor.id, opp)) {
    throw new NotFoundError();
  }
  const ar = await db.accessRequest.findUnique({
    where: { buyerId_opportunityId: { buyerId: actor.id, opportunityId: opp.id } },
    select: {
      id: true,
      status: true,
      purpose: true,
      createdAt: true,
      ndaSignatures: {
        select: { signedAt: true, expiresAt: true, documentHash: true },
        orderBy: { signedAt: 'desc' },
        take: 1,
      },
    },
  });
  const sig = ar?.ndaSignatures[0] ?? null;
  const state = ndaState(sig, now);
  return {
    opportunity: {
      id: opp.id,
      title: opp.title,
      sectorLabel: SECTOR_LABELS[opp.company.sector],
      department: opp.company.department,
      typeLabel: OPPORTUNITY_TYPE_LABELS[opp.type as OpportunityType].label,
    },
    request: ar
      ? { id: ar.id, status: ar.status, purpose: ar.purpose, createdAt: ar.createdAt }
      : null,
    nda: sig
      ? { signedAt: sig.signedAt, expiresAt: sig.expiresAt, state, documentHash: sig.documentHash }
      : null,
    canOpenDataRoom: canAccessConfidential({
      user: { id: actor.id, role: actor.role, status: actor.status },
      opportunity: { sellerId: opp.sellerId, status: opp.status },
      access: ar ? { status: ar.status } : null,
      nda: sig ? { signedAt: sig.signedAt, expiresAt: sig.expiresAt } : null,
      now,
    }),
    needsSignature:
      ar?.status === 'REQUESTED' || (ar?.status === 'AUTHORIZED' && state !== 'SIGNED'),
    ndaText: NDA_TEXT,
    ndaVersion: NDA_VERSION,
  };
}

// ───────────────────────────── seller ─────────────────────────────

export const ACCESS_TABS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type AccessTab = (typeof ACCESS_TABS)[number];

const TAB_STATUSES: Record<AccessTab, AccessStatus[]> = {
  PENDING: ['REQUESTED', 'NDA_SIGNED'],
  APPROVED: ['AUTHORIZED'],
  REJECTED: ['REJECTED', 'REVOKED'],
};

export type SellerAccessRow = {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  buyerName: string;
  buyerTypeLabel: string | null;
  purpose: string;
  relevance: number;
  status: AccessStatus;
  ndaState: NdaState;
  ndaExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  canApprove: boolean;
  canReject: boolean;
  canRevoke: boolean;
};

/** The seller's requests (own opportunities only) for one tab, plus every tab's count. */
export async function listAccessRequests(
  actor: Actor,
  tab: AccessTab,
  now: Date = new Date(),
): Promise<{ items: SellerAccessRow[]; counts: Record<AccessTab, number> }> {
  assertEnabled(actor, 'SELLER');
  const own = { opportunity: { sellerId: actor.id } } satisfies Prisma.AccessRequestWhereInput;
  const [rows, grouped] = await Promise.all([
    db.accessRequest.findMany({
      where: { ...own, status: { in: TAB_STATUSES[tab] } },
      orderBy: [{ relevance: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        purpose: true,
        relevance: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        opportunity: { select: { id: true, title: true } },
        buyer: {
          select: {
            name: true,
            organization: { select: { name: true, buyerType: true } },
          },
        },
        ndaSignatures: {
          select: { signedAt: true, expiresAt: true },
          orderBy: { signedAt: 'desc' },
          take: 1,
        },
      },
    }),
    db.accessRequest.groupBy({ by: ['status'], where: own, _count: { _all: true } }),
  ]);

  const counts: Record<AccessTab, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const g of grouped) {
    for (const t of ACCESS_TABS) {
      if (TAB_STATUSES[t].includes(g.status)) counts[t] += g._count._all;
    }
  }

  const items = rows.map((r): SellerAccessRow => {
    const sig = r.ndaSignatures[0] ?? null;
    const state = ndaState(sig, now);
    const buyerType = r.buyer.organization?.buyerType;
    return {
      id: r.id,
      opportunityId: r.opportunity.id,
      opportunityTitle: r.opportunity.title,
      buyerName: r.buyer.organization?.name ?? r.buyer.name,
      buyerTypeLabel: buyerType ? (BUYER_TYPE_LABEL[buyerType] ?? null) : null,
      purpose: r.purpose,
      relevance: r.relevance,
      status: r.status,
      ndaState: state,
      ndaExpiresAt: sig?.expiresAt ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      canApprove: accessMachine.can(r.status, 'APPROVE', 'SELLER') && state === 'SIGNED',
      canReject: accessMachine.can(r.status, 'REJECT', 'SELLER'),
      canRevoke: accessMachine.can(r.status, 'REVOKE', 'SELLER'),
    };
  });
  return { items, counts };
}

/**
 * The owning seller approves (only from NDA_SIGNED with a valid NDA) or
 * rejects. A foreign request is `NotFoundError`. Notifies the buyer.
 */
export async function decideAccess(
  actor: Actor,
  accessRequestId: string,
  decision: 'APPROVE' | 'REJECT',
  now: Date = new Date(),
): Promise<void> {
  assertEnabled(actor, 'SELLER');
  const id = parseId(accessRequestId);
  const emails = await audited(async (tx) => {
    const ar = await lockRequest(tx, id);
    if (!ar || ar.sellerId !== actor.id) throw new NotFoundError();
    const next = accessMachine.transition(ar.status, decision, 'SELLER');
    if (decision === 'APPROVE' && ndaState(await latestNda(tx, ar.id), now) !== 'SIGNED') {
      throw new ValidationError('El acuerdo de confidencialidad del comprador no está vigente.');
    }
    await tx.accessRequest.update({ where: { id: ar.id }, data: { status: next } });
    const kind: NotificationKind = decision === 'APPROVE' ? 'ACCESS_APPROVED' : 'ACCESS_REJECTED';
    await notify(tx, {
      userId: ar.buyerId,
      kind,
      payload: { accessRequestId: ar.id, opportunityId: ar.opportunityId },
    });
    const buyer = await contactOf(tx, ar.buyerId);
    return {
      result: [{ to: buyer.email, kind, name: buyer.name }],
      audit: {
        actorId: actor.id,
        action: decision === 'APPROVE' ? 'ACCESS_APPROVED' : 'ACCESS_REJECTED',
        entity: 'AccessRequest',
        entityId: ar.id,
        before: { status: ar.status },
        after: { status: next, opportunityId: ar.opportunityId },
      },
    };
  });
  await sendAll(emails);
}

/** AUTHORIZED → REVOKED by the owning seller or an ENABLED Back Office user. */
export async function revokeAccess(actor: Actor, accessRequestId: string): Promise<void> {
  assertEnabled(actor, 'SELLER', 'BACKOFFICE');
  const id = parseId(accessRequestId);
  const emails = await audited(async (tx) => {
    const ar = await lockRequest(tx, id);
    if (!ar || (actor.role === 'SELLER' && ar.sellerId !== actor.id)) throw new NotFoundError();
    const next = accessMachine.transition(ar.status, 'REVOKE', actor.role);
    await tx.accessRequest.update({ where: { id: ar.id }, data: { status: next } });
    await notify(tx, {
      userId: ar.buyerId,
      kind: 'ACCESS_REVOKED',
      payload: { accessRequestId: ar.id, opportunityId: ar.opportunityId },
    });
    const buyer = await contactOf(tx, ar.buyerId);
    return {
      result: [{ to: buyer.email, kind: 'ACCESS_REVOKED' as const, name: buyer.name }],
      audit: {
        actorId: actor.id,
        action: 'ACCESS_REVOKED',
        entity: 'AccessRequest',
        entityId: ar.id,
        before: { status: ar.status },
        after: { status: next, opportunityId: ar.opportunityId },
      },
    };
  });
  await sendAll(emails);
}

// ───────────────────────────── Back Office ─────────────────────────────

/** NDA column: Firmado / Vencido / En firma (buyer at the signing step) / Pendiente (never signed). */
export type ConfidentialityNda = 'SIGNED' | 'EXPIRED' | 'SIGNING' | 'PENDING';
/** Access column: Con acceso / Sin acceso / Bloqueado (rejected, revoked or NDA expired). */
export type ConfidentialityAccess = 'GRANTED' | 'NONE' | 'BLOCKED';

export type ConfidentialityRow = {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  companyName: string;
  buyerName: string;
  buyerEmail: string;
  status: AccessStatus;
  nda: ConfidentialityNda;
  ndaExpiresAt: Date | null;
  access: ConfidentialityAccess;
  lastActivity: Date;
  revocable: boolean;
};

/** Company × buyer × NDA × access, most recent activity first (BACKOFFICE only). */
export async function listConfidentiality(
  actor: Actor,
  now: Date = new Date(),
): Promise<ConfidentialityRow[]> {
  assertEnabled(actor, 'BACKOFFICE');
  const rows = await db.accessRequest.findMany({
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: 500,
    select: {
      id: true,
      status: true,
      updatedAt: true,
      opportunity: {
        select: {
          id: true,
          title: true,
          status: true,
          sellerId: true,
          company: { select: { organization: { select: { name: true } } } },
        },
      },
      buyer: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          organization: { select: { name: true } },
        },
      },
      ndaSignatures: {
        select: { signedAt: true, expiresAt: true },
        orderBy: { signedAt: 'desc' },
        take: 1,
      },
    },
  });

  return rows
    .map((r): ConfidentialityRow => {
      const sig = r.ndaSignatures[0] ?? null;
      const state = ndaState(sig, now);
      const nda: ConfidentialityNda = sig
        ? state === 'SIGNED'
          ? 'SIGNED'
          : state === 'EXPIRED'
            ? 'EXPIRED'
            : 'PENDING'
        : r.status === 'REQUESTED'
          ? 'SIGNING'
          : 'PENDING';
      const granted = canAccessConfidential({
        user: { id: r.buyer.id, role: r.buyer.role, status: r.buyer.status },
        opportunity: { sellerId: r.opportunity.sellerId, status: r.opportunity.status },
        access: { status: r.status },
        nda: sig,
        now,
      });
      const access: ConfidentialityAccess = granted
        ? 'GRANTED'
        : r.status === 'REJECTED' || r.status === 'REVOKED' || r.status === 'AUTHORIZED'
          ? 'BLOCKED'
          : 'NONE';
      const signedAt = sig?.signedAt.getTime() ?? 0;
      return {
        id: r.id,
        opportunityId: r.opportunity.id,
        opportunityTitle: r.opportunity.title,
        companyName: r.opportunity.company.organization.name,
        buyerName: r.buyer.organization?.name ?? r.buyer.name,
        buyerEmail: r.buyer.email,
        status: r.status,
        nda,
        ndaExpiresAt: sig?.expiresAt ?? null,
        access,
        lastActivity: new Date(Math.max(r.updatedAt.getTime(), signedAt)),
        revocable: accessMachine.can(r.status, 'REVOKE', 'BACKOFFICE'),
      };
    })
    .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
}
