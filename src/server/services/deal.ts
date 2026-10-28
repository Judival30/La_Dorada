/**
 * Negotiation (H4 minimal): offer ⇄ counter-offer, acceptance by the
 * counterparty (P7), LOI signed by both parties, due diligence, close confirmed
 * by both parties, and withdrawal from any non-terminal state (R5).
 *
 * - R4: Back Office never transitions a deal. Every mutation rejects BACKOFFICE
 *   explicitly, and `dealMachine` has no BACKOFFICE actor either.
 * - Parties: the deal's buyer, or the seller who owns the opportunity. Anyone
 *   else gets `NotFoundError` (404), never a hint that the deal exists.
 * - Every mutation locks the Deal row (`SELECT … FOR UPDATE`) inside `audited()`
 *   and moves the status only through `dealMachine`. Audit rows carry ids and
 *   states only; the withdrawal reason lives only in the notification payload.
 * - `Deal.stage` is no longer written: the stepper uses `dealStageOf` (P8).
 */
import type { OfferAuthor, OfferStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { loiHash, loiText } from '@/content/loi';
import {
  canAcceptOffer,
  dealActionsFor,
  dealStageOf,
  makeOfferSchema,
  type DealAction,
  type DealParty,
  type DealStage,
  type OfferInput,
  type OfferTerms,
} from '@/domain/deal';
import {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  ValidationError,
} from '@/domain/errors';
import type { AccessStatus } from '@/domain/machines/access';
import { dealMachine, type DealEvent, type DealStatus } from '@/domain/machines/deal';
import { opportunityMachine, type OpportunityStatus } from '@/domain/machines/opportunity';
import { formatCOP, millions } from '@/domain/money';
import { OPPORTUNITY_TYPE_LABELS, type OpportunityType } from '@/domain/opportunity';
import { canAccessConfidential, ndaState } from '@/domain/policies/confidential';
import { SECTOR_LABELS } from '@/domain/sectors';
import { audited } from '@/server/audit/audited';
import type { AuditEntry } from '@/server/audit/audit';
import type { SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { notify, sendTemplatedEmail, type NotificationKind } from '@/server/notify/notify';

type Actor = Pick<SessionUser, 'id' | 'role' | 'status'>;
type Email = { to: string; kind: NotificationKind; name: string };
type Notice = { userId: string; kind: NotificationKind; payload: Record<string, unknown> };

export const WITHDRAW_REASON_MAX = 500;

const idSchema = z.string().min(1).max(64);
const reasonSchema = z
  .string()
  .trim()
  .max(WITHDRAW_REASON_MAX, `El motivo puede tener máximo ${WITHDRAW_REASON_MAX} caracteres.`)
  .optional();

function parseId(id: string): string {
  const p = idSchema.safeParse(id);
  if (!p.success) throw new NotFoundError();
  return p.data;
}

function parseTerms(input: OfferInput, now: Date): OfferTerms {
  const p = makeOfferSchema(() => now).safeParse(input);
  if (!p.success) throw new ValidationError(p.error.issues[0]?.message ?? 'Revisa la oferta.');
  return p.data;
}

/** R4 (explicit, before any lookup) plus the ENABLED check every party needs. */
function assertCanMutate(actor: Actor): void {
  if (actor.role === 'BACKOFFICE') {
    throw new ForbiddenError('Back Office may not transition a deal');
  }
  if (actor.status !== 'ENABLED') throw new ForbiddenError('User not enabled');
}

/**
 * Target state for `event`, or `InvalidTransitionError` when `party` cannot fire
 * it from `status` (e.g. countering while waiting for the other side). The
 * caller already resolved `party`, so a machine refusal is a state problem.
 */
function step(status: DealStatus, event: DealEvent, party: DealParty): DealStatus {
  if (!dealMachine.can(status, event, party)) {
    throw new InvalidTransitionError('deal', status, event);
  }
  return dealMachine.transition(status, event, party);
}

type LockedDeal = {
  id: string;
  buyerId: string;
  opportunityId: string;
  status: DealStatus;
  buyerClosedAt: Date | null;
  sellerClosedAt: Date | null;
  sellerId: string;
  opportunityTitle: string;
};

/** Locks the Deal row (not the opportunity) and returns it with its opportunity's owner. */
async function lockDeal(tx: Prisma.TransactionClient, id: string): Promise<LockedDeal | null> {
  const rows = await tx.$queryRaw<LockedDeal[]>`
    SELECT d.id, d."buyerId", d."opportunityId", d.status::text AS status,
           d."buyerClosedAt", d."sellerClosedAt",
           o."sellerId", o.title AS "opportunityTitle"
    FROM "Deal" d
    JOIN "Opportunity" o ON o.id = d."opportunityId"
    WHERE d.id = ${id}
    FOR UPDATE OF d`;
  return rows[0] ?? null;
}

function partyOf(actor: Actor, deal: { buyerId: string; sellerId: string }): DealParty | null {
  if (actor.role === 'BUYER' && actor.id === deal.buyerId) return 'BUYER';
  if (actor.role === 'SELLER' && actor.id === deal.sellerId) return 'SELLER';
  return null;
}

const counterpartyOf = (deal: LockedDeal, party: DealParty): string =>
  party === 'BUYER' ? deal.sellerId : deal.buyerId;

/** Writes the in-app notifications and returns the emails to send after commit. */
async function deliver(tx: Prisma.TransactionClient, notices: Notice[]): Promise<Email[]> {
  const emails: Email[] = [];
  for (const n of notices) {
    await notify(tx, n);
    const u = await tx.user.findUniqueOrThrow({
      where: { id: n.userId },
      select: { email: true, name: true },
    });
    emails.push({ to: u.email, kind: n.kind, name: u.name });
  }
  return emails;
}

async function sendAll(emails: Email[]): Promise<void> {
  for (const e of emails) await sendTemplatedEmail(e.to, e.kind, { name: e.name });
}

type StepOutcome = { audit: AuditEntry | AuditEntry[]; notices: Notice[] };

/**
 * Shared shape of every deal mutation: R4 + enabled check, lock, resolve the
 * party (404 for strangers), run `fn`, notify in the transaction, email after.
 */
async function mutateDeal(
  actor: Actor,
  dealId: string,
  fn: (tx: Prisma.TransactionClient, deal: LockedDeal, party: DealParty) => Promise<StepOutcome>,
): Promise<void> {
  assertCanMutate(actor);
  const id = parseId(dealId);
  const emails = await audited(async (tx) => {
    const deal = await lockDeal(tx, id);
    const party = deal ? partyOf(actor, deal) : null;
    if (!deal || !party) throw new NotFoundError();
    const { audit, notices } = await fn(tx, deal, party);
    return { result: await deliver(tx, notices), audit };
  });
  await sendAll(emails);
}

/** Marks the pending offer `status` and adds the new PENDING offer chained to the latest one. */
async function addOffer(
  tx: Prisma.TransactionClient,
  dealId: string,
  author: OfferAuthor,
  authorId: string,
  terms: OfferTerms,
): Promise<{ id: string }> {
  const latest = await tx.offer.findFirst({
    where: { dealId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  await tx.offer.updateMany({
    where: { dealId, status: 'PENDING' },
    data: { status: 'COUNTERED' satisfies OfferStatus },
  });
  return tx.offer.create({
    data: {
      dealId,
      parentOfferId: latest?.id ?? null,
      author,
      authorId,
      preMoneyValue: millions(terms.preMoneyValue),
      stakePct: terms.stakePct,
      investmentType: terms.investmentType,
      paymentScheme: terms.paymentScheme,
      exclusivityDays: terms.exclusivityDays,
      validUntil: terms.validUntil,
      status: 'PENDING',
    },
    select: { id: true },
  });
}

// ───────────────────────────── offers ─────────────────────────────

/**
 * BUYER with confidential access (`canAccessConfidential`) makes an offer on a
 * PUBLISHED opportunity. The first offer creates the Deal (OFFER_SENT); while a
 * non-terminal deal exists it is the buyer's counter (COUNTER from COUNTER_OFFER).
 * A CLOSED deal cannot be reopened; after WITHDRAWN a new deal starts.
 */
export async function makeOffer(
  actor: Actor,
  opportunityId: string,
  input: OfferInput,
  now: Date = new Date(),
): Promise<{ dealId: string; offerId: string }> {
  assertCanMutate(actor);
  if (actor.role !== 'BUYER') throw new ForbiddenError('Only buyers make offers');
  const terms = parseTerms(input, now);
  const oppId = parseId(opportunityId);

  const out = await audited(async (tx) => {
    // Serializes a buyer's offers on one opportunity (no duplicate first deal).
    const [ar] = await tx.$queryRaw<{ id: string; status: AccessStatus }[]>`
      SELECT id, status::text AS status FROM "AccessRequest"
      WHERE "buyerId" = ${actor.id} AND "opportunityId" = ${oppId}
      FOR UPDATE`;
    const opp = await tx.opportunity.findUnique({
      where: { id: oppId },
      select: { id: true, status: true, sellerId: true },
    });
    if (!opp || opp.status !== 'PUBLISHED') throw new NotFoundError();
    const nda = ar
      ? await tx.ndaSignature.findFirst({
          where: { accessRequestId: ar.id },
          orderBy: { signedAt: 'desc' },
          select: { signedAt: true, expiresAt: true },
        })
      : null;
    const allowed = canAccessConfidential({
      user: { id: actor.id, role: actor.role, status: actor.status },
      opportunity: { sellerId: opp.sellerId, status: opp.status },
      access: ar ? { status: ar.status } : null,
      nda,
      now,
    });
    if (!allowed) throw new ForbiddenError('Confidential access required to make an offer');

    const latest = await tx.deal.findFirst({
      where: { opportunityId: opp.id, buyerId: actor.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, status: true },
    });
    if (latest?.status === 'CLOSED') throw new InvalidTransitionError('deal', 'CLOSED', 'COUNTER');

    let dealId: string;
    let before: DealStatus | null = null;
    let next: DealStatus;
    if (latest && latest.status !== 'WITHDRAWN') {
      const deal = await lockDeal(tx, latest.id);
      if (!deal) throw new NotFoundError();
      before = deal.status;
      next = step(deal.status, 'COUNTER', 'BUYER');
      dealId = deal.id;
      await tx.deal.update({ where: { id: dealId }, data: { status: next } });
    } else {
      next = 'OFFER_SENT';
      dealId = (
        await tx.deal.create({
          data: { opportunityId: opp.id, buyerId: actor.id, status: next },
          select: { id: true },
        })
      ).id;
    }
    const offer = await addOffer(tx, dealId, 'BUYER', actor.id, terms);
    const emails = await deliver(tx, [
      {
        userId: opp.sellerId,
        kind: 'DEAL_OFFER_RECEIVED',
        payload: { dealId, offerId: offer.id, opportunityId: opp.id },
      },
    ]);
    return {
      result: { dealId, offerId: offer.id, emails },
      audit: {
        actorId: actor.id,
        action: before ? 'OFFER_COUNTERED' : 'OFFER_SUBMITTED',
        entity: 'Deal',
        entityId: dealId,
        before: before ? { status: before } : undefined,
        after: { status: next, offerId: offer.id, opportunityId: opp.id },
      },
    };
  });
  await sendAll(out.emails);
  return { dealId: out.dealId, offerId: out.offerId };
}

/** The owning SELLER answers the buyer's offer with a counter-offer (OFFER_SENT → COUNTER_OFFER). */
export async function counterOffer(
  actor: Actor,
  dealId: string,
  input: OfferInput,
  now: Date = new Date(),
): Promise<{ offerId: string }> {
  assertCanMutate(actor);
  if (actor.role !== 'SELLER') throw new ForbiddenError('Only the seller uses counterOffer');
  const terms = parseTerms(input, now);
  let offerId = '';
  await mutateDeal(actor, dealId, async (tx, deal, party) => {
    const next = step(deal.status, 'COUNTER', party);
    const opp = await tx.opportunity.findUniqueOrThrow({
      where: { id: deal.opportunityId },
      select: { status: true },
    });
    if (opp.status !== 'PUBLISHED')
      throw new InvalidTransitionError('deal', deal.status, 'COUNTER');
    offerId = (await addOffer(tx, deal.id, 'SELLER', actor.id, terms)).id;
    await tx.deal.update({ where: { id: deal.id }, data: { status: next } });
    return {
      audit: {
        actorId: actor.id,
        action: 'OFFER_COUNTERED',
        entity: 'Deal',
        entityId: deal.id,
        before: { status: deal.status },
        after: { status: next, offerId, opportunityId: deal.opportunityId },
      },
      notices: [
        {
          userId: deal.buyerId,
          kind: 'DEAL_OFFER_RECEIVED',
          payload: { dealId: deal.id, offerId, opportunityId: deal.opportunityId },
        },
      ],
    };
  });
  return { offerId };
}

/**
 * The counterparty of the pending offer accepts it (P7) → PRELIMINARY_AGREEMENT,
 * and the LOI is generated with `documentHash = sha256(loiText(terms))`.
 */
export async function acceptOffer(
  actor: Actor,
  dealId: string,
  now: Date = new Date(),
): Promise<void> {
  await mutateDeal(actor, dealId, async (tx, deal, party) => {
    const next = step(deal.status, 'ACCEPT', party);
    const offer = await tx.offer.findFirst({
      where: { dealId: deal.id, status: 'PENDING' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!offer) throw new InvalidTransitionError('deal', deal.status, 'ACCEPT');
    if (!canAcceptOffer(offer.author, party)) {
      throw new ForbiddenError('Only the counterparty may accept an offer');
    }
    if (offer.validUntil.getTime() <= now.getTime()) {
      throw new ValidationError('Esta oferta ya venció. Responde con una contraoferta.');
    }
    await tx.offer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED' } });
    const documentHash = loiHash(
      loiText({
        dealId: deal.id,
        offerId: offer.id,
        opportunityTitle: deal.opportunityTitle,
        preMoneyValue: offer.preMoneyValue,
        stakePct: offer.stakePct,
        investmentType: offer.investmentType,
        paymentScheme: offer.paymentScheme,
        exclusivityDays: offer.exclusivityDays,
        validUntil: offer.validUntil,
      }),
    );
    const loi = await tx.loi.create({
      data: { dealId: deal.id, offerId: offer.id, documentHash },
      select: { id: true },
    });
    await tx.deal.update({ where: { id: deal.id }, data: { status: next } });
    return {
      audit: {
        actorId: actor.id,
        action: 'OFFER_ACCEPTED',
        entity: 'Deal',
        entityId: deal.id,
        before: { status: deal.status },
        after: { status: next, offerId: offer.id, loiId: loi.id, documentHash },
      },
      notices: [
        {
          userId: counterpartyOf(deal, party),
          kind: 'DEAL_OFFER_ACCEPTED',
          payload: { dealId: deal.id, offerId: offer.id, opportunityId: deal.opportunityId },
        },
      ],
    };
  });
}

// ───────────────────────────── LOI, DD, close ─────────────────────────────

/** Each party signs the LOI once; the second signature applies SIGN_LOI → LOI_SIGNED. */
export async function signLoi(actor: Actor, dealId: string, now: Date = new Date()): Promise<void> {
  await mutateDeal(actor, dealId, async (tx, deal, party) => {
    const next = step(deal.status, 'SIGN_LOI', party);
    const loi = await tx.loi.findFirst({
      where: { dealId: deal.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!loi) throw new InvalidTransitionError('deal', deal.status, 'SIGN_LOI');
    const mine = party === 'BUYER' ? loi.signedByBuyerAt : loi.signedBySellerAt;
    const theirs = party === 'BUYER' ? loi.signedBySellerAt : loi.signedByBuyerAt;
    if (mine) throw new InvalidTransitionError('deal', deal.status, 'SIGN_LOI');
    await tx.loi.update({
      where: { id: loi.id },
      data: party === 'BUYER' ? { signedByBuyerAt: now } : { signedBySellerAt: now },
    });
    const after: DealStatus = theirs ? next : deal.status;
    if (theirs) await tx.deal.update({ where: { id: deal.id }, data: { status: after } });
    return {
      audit: {
        actorId: actor.id,
        action: 'LOI_SIGNED',
        entity: 'Deal',
        entityId: deal.id,
        before: { status: deal.status },
        after: { status: after, loiId: loi.id, signer: party, documentHash: loi.documentHash },
      },
      notices: [
        {
          userId: counterpartyOf(deal, party),
          kind: 'DEAL_LOI_SIGNED',
          payload: { dealId: deal.id, opportunityId: deal.opportunityId },
        },
      ],
    };
  });
}

/** Either party starts due diligence once the LOI is signed (LOI_SIGNED → DUE_DILIGENCE). */
export async function startDueDiligence(actor: Actor, dealId: string): Promise<void> {
  await mutateDeal(actor, dealId, async (tx, deal, party) => {
    const next = step(deal.status, 'START_DD', party);
    await tx.deal.update({ where: { id: deal.id }, data: { status: next } });
    return {
      audit: {
        actorId: actor.id,
        action: 'DUE_DILIGENCE_STARTED',
        entity: 'Deal',
        entityId: deal.id,
        before: { status: deal.status },
        after: { status: next },
      },
      notices: [
        {
          userId: counterpartyOf(deal, party),
          kind: 'DEAL_DD_STARTED',
          payload: { dealId: deal.id, opportunityId: deal.opportunityId },
        },
      ],
    };
  });
}

/**
 * Each party confirms the close once. The second confirmation applies
 * CONFIRM_CLOSE → CLOSED and closes the opportunity (CLOSE by SYSTEM), which
 * takes it off the marketplace. Both parties are notified.
 */
export async function confirmClose(
  actor: Actor,
  dealId: string,
  now: Date = new Date(),
): Promise<void> {
  await mutateDeal(actor, dealId, async (tx, deal, party) => {
    const next = step(deal.status, 'CONFIRM_CLOSE', party);
    const mine = party === 'BUYER' ? deal.buyerClosedAt : deal.sellerClosedAt;
    const theirs = party === 'BUYER' ? deal.sellerClosedAt : deal.buyerClosedAt;
    if (mine) throw new InvalidTransitionError('deal', deal.status, 'CONFIRM_CLOSE');
    const after: DealStatus = theirs ? next : deal.status;
    await tx.deal.update({
      where: { id: deal.id },
      data: {
        ...(party === 'BUYER' ? { buyerClosedAt: now } : { sellerClosedAt: now }),
        ...(theirs ? { status: after } : {}),
      },
    });
    const audit: AuditEntry[] = [
      {
        actorId: actor.id,
        action: 'DEAL_CLOSE_CONFIRMED',
        entity: 'Deal',
        entityId: deal.id,
        before: { status: deal.status },
        after: { status: after, confirmedBy: party },
      },
    ];
    if (!theirs) {
      return {
        audit,
        notices: [
          {
            userId: counterpartyOf(deal, party),
            kind: 'DEAL_CLOSE_CONFIRMED',
            payload: { dealId: deal.id, opportunityId: deal.opportunityId },
          },
        ],
      };
    }
    const [opp] = await tx.$queryRaw<{ status: OpportunityStatus }[]>`
      SELECT status::text AS status FROM "Opportunity" WHERE id = ${deal.opportunityId} FOR UPDATE`;
    if (!opp) throw new NotFoundError();
    const oppNext = opportunityMachine.transition(opp.status, 'CLOSE', 'SYSTEM');
    await tx.opportunity.update({ where: { id: deal.opportunityId }, data: { status: oppNext } });
    audit.push({
      actorId: null,
      action: 'OPPORTUNITY_CLOSED',
      entity: 'Opportunity',
      entityId: deal.opportunityId,
      before: { status: opp.status },
      after: { status: oppNext, dealId: deal.id },
    });
    const payload = { dealId: deal.id, opportunityId: deal.opportunityId };
    return {
      audit,
      notices: [
        { userId: deal.buyerId, kind: 'DEAL_CLOSED', payload },
        { userId: deal.sellerId, kind: 'DEAL_CLOSED', payload },
      ],
    };
  });
}

/**
 * R5: the buyer or the seller ends the process from any non-terminal state.
 * The optional reason (≤ 500) goes only to the counterparty's notification.
 */
export async function withdraw(actor: Actor, dealId: string, reason?: string): Promise<void> {
  assertCanMutate(actor);
  const r = reasonSchema.safeParse(reason);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? 'Revisa el motivo.');
  const text = r.data ? r.data : undefined;
  await mutateDeal(actor, dealId, async (tx, deal, party) => {
    const next = step(deal.status, 'WITHDRAW', party);
    await tx.offer.updateMany({
      where: { dealId: deal.id, status: 'PENDING' },
      data: { status: 'WITHDRAWN' },
    });
    await tx.deal.update({ where: { id: deal.id }, data: { status: next } });
    return {
      audit: {
        actorId: actor.id,
        action: 'DEAL_WITHDRAWN',
        entity: 'Deal',
        entityId: deal.id,
        before: { status: deal.status },
        after: { status: next, withdrawnBy: party },
      },
      notices: [
        {
          userId: counterpartyOf(deal, party),
          kind: 'DEAL_WITHDRAWN',
          payload: {
            dealId: deal.id,
            opportunityId: deal.opportunityId,
            withdrawnBy: party,
            ...(text ? { reason: text } : {}),
          },
        },
      ],
    };
  });
}

// ───────────────────────────── reads ─────────────────────────────

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  PENDING: 'Pendiente de respuesta',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  COUNTERED: 'Contraofertada',
  WITHDRAWN: 'Retirada',
  EXPIRED: 'Vencida',
};

export type OfferView = {
  id: string;
  author: DealParty;
  preMoneyLabel: string;
  /** Millions of pesos, to prefill the counter-offer form. */
  preMoneyMillions: number;
  stakePct: number;
  investmentType: string;
  paymentScheme: string;
  exclusivityDays: number;
  validUntil: Date;
  status: OfferStatus;
  createdAt: Date;
};

export type DealViewer = DealParty | 'BACKOFFICE';

export type DealView = {
  id: string;
  status: DealStatus;
  stage: DealStage;
  viewer: DealViewer;
  opportunity: {
    id: string;
    title: string;
    sectorLabel: string;
    department: string;
    typeLabel: string;
  };
  buyerName: string;
  /** Newest first. */
  offers: OfferView[];
  /** The latest offer (pending, accepted or last before withdrawal). */
  current: OfferView | null;
  loi: {
    text: string;
    documentHash: string;
    createdAt: Date;
    buyerSignedAt: Date | null;
    sellerSignedAt: Date | null;
  } | null;
  close: { buyerConfirmedAt: Date | null; sellerConfirmedAt: Date | null };
  /** Buttons for the viewer (always empty for Back Office). */
  actions: DealAction[];
  milestones: {
    contactAt: Date | null;
    ndaSignedAt: Date | null;
    firstOfferAt: Date | null;
    loiCreatedAt: Date | null;
    loiSignedAt: Date | null;
  };
  updatedAt: Date;
};

function toOfferView(o: {
  id: string;
  author: OfferAuthor;
  preMoneyValue: bigint;
  stakePct: number;
  investmentType: string;
  paymentScheme: string;
  exclusivityDays: number;
  validUntil: Date;
  status: OfferStatus;
  createdAt: Date;
}): OfferView {
  return {
    id: o.id,
    author: o.author,
    preMoneyLabel: formatCOP(o.preMoneyValue),
    preMoneyMillions: Number(o.preMoneyValue / 1_000_000n),
    stakePct: o.stakePct,
    investmentType: o.investmentType,
    paymentScheme: o.paymentScheme,
    exclusivityDays: o.exclusivityDays,
    validUntil: o.validUntil,
    status: o.status,
    createdAt: o.createdAt,
  };
}

const OFFER_SELECT = {
  id: true,
  author: true,
  preMoneyValue: true,
  stakePct: true,
  investmentType: true,
  paymentScheme: true,
  exclusivityDays: true,
  validUntil: true,
  status: true,
  createdAt: true,
} satisfies Prisma.OfferSelect;

/** The deal's buyer, the owning seller, or Back Office (read-only). Everyone else: 404. */
export async function getDeal(
  actor: Actor,
  dealId: string,
  now: Date = new Date(),
): Promise<DealView> {
  if (actor.status !== 'ENABLED') throw new NotFoundError();
  const deal = await db.deal.findUnique({
    where: { id: parseId(dealId) },
    select: {
      id: true,
      status: true,
      buyerId: true,
      buyerClosedAt: true,
      sellerClosedAt: true,
      createdAt: true,
      updatedAt: true,
      opportunity: {
        select: {
          id: true,
          title: true,
          type: true,
          sellerId: true,
          company: { select: { sector: true, department: true } },
        },
      },
      buyer: { select: { name: true, organization: { select: { name: true } } } },
      offers: { select: OFFER_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
      lois: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          documentHash: true,
          createdAt: true,
          signedByBuyerAt: true,
          signedBySellerAt: true,
          offer: { select: OFFER_SELECT },
        },
      },
    },
  });
  if (!deal) throw new NotFoundError();
  const party = partyOf(actor, { buyerId: deal.buyerId, sellerId: deal.opportunity.sellerId });
  if (!party && actor.role !== 'BACKOFFICE') throw new NotFoundError();

  const access = await db.accessRequest.findUnique({
    where: {
      buyerId_opportunityId: { buyerId: deal.buyerId, opportunityId: deal.opportunity.id },
    },
    select: {
      status: true,
      createdAt: true,
      ndaSignatures: {
        select: { signedAt: true, expiresAt: true },
        orderBy: { signedAt: 'desc' },
        take: 1,
      },
    },
  });
  const sig = access?.ndaSignatures[0] ?? null;
  const offers = deal.offers.map(toOfferView);
  const pending = offers.find((o) => o.status === 'PENDING') ?? null;
  const loiRow = deal.lois[0] ?? null;
  const loi = loiRow
    ? {
        text: loiText({
          dealId: deal.id,
          offerId: loiRow.offer.id,
          opportunityTitle: deal.opportunity.title,
          preMoneyValue: loiRow.offer.preMoneyValue,
          stakePct: loiRow.offer.stakePct,
          investmentType: loiRow.offer.investmentType,
          paymentScheme: loiRow.offer.paymentScheme,
          exclusivityDays: loiRow.offer.exclusivityDays,
          validUntil: loiRow.offer.validUntil,
        }),
        documentHash: loiRow.documentHash,
        createdAt: loiRow.createdAt,
        buyerSignedAt: loiRow.signedByBuyerAt,
        sellerSignedAt: loiRow.signedBySellerAt,
      }
    : null;
  const bothSigned =
    loi?.buyerSignedAt && loi.sellerSignedAt
      ? new Date(Math.max(loi.buyerSignedAt.getTime(), loi.sellerSignedAt.getTime()))
      : null;

  return {
    id: deal.id,
    status: deal.status,
    stage: dealStageOf({
      accessStatus: access?.status ?? null,
      ndaSigned: ndaState(sig, now) === 'SIGNED',
      dealStatus: deal.status,
    }),
    viewer: party ?? 'BACKOFFICE',
    opportunity: {
      id: deal.opportunity.id,
      title: deal.opportunity.title,
      sectorLabel: SECTOR_LABELS[deal.opportunity.company.sector],
      department: deal.opportunity.company.department,
      typeLabel: OPPORTUNITY_TYPE_LABELS[deal.opportunity.type as OpportunityType].label,
    },
    buyerName: deal.buyer.organization?.name ?? deal.buyer.name,
    offers,
    current: offers[0] ?? null,
    loi,
    close: { buyerConfirmedAt: deal.buyerClosedAt, sellerConfirmedAt: deal.sellerClosedAt },
    actions: dealActionsFor({
      status: deal.status,
      party,
      pendingOfferAuthor: pending?.author ?? null,
      signedLoi: Boolean(party === 'BUYER' ? loi?.buyerSignedAt : loi?.sellerSignedAt),
      confirmedClose: Boolean(party === 'BUYER' ? deal.buyerClosedAt : deal.sellerClosedAt),
    }),
    milestones: {
      contactAt: access?.createdAt ?? null,
      ndaSignedAt: sig?.signedAt ?? null,
      firstOfferAt: offers.at(-1)?.createdAt ?? deal.createdAt,
      loiCreatedAt: loi?.createdAt ?? null,
      loiSignedAt: bothSigned,
    },
    updatedAt: deal.updatedAt,
  };
}

export type DealRow = {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  buyerName: string;
  status: DealStatus;
  stage: DealStage;
  lastOffer: { author: DealParty; preMoneyLabel: string; stakePct: number } | null;
  /** True when the viewer has something to do besides withdrawing. */
  awaitingMe: boolean;
  updatedAt: Date;
};

/** A buyer's own deals, or the deals on a seller's own opportunities (newest activity first). */
export async function listDeals(actor: Actor): Promise<DealRow[]> {
  if (actor.status !== 'ENABLED' || (actor.role !== 'BUYER' && actor.role !== 'SELLER')) {
    throw new ForbiddenError('Role not allowed');
  }
  const party: DealParty = actor.role;
  const rows = await db.deal.findMany({
    where: party === 'BUYER' ? { buyerId: actor.id } : { opportunity: { sellerId: actor.id } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: 200,
    select: {
      id: true,
      status: true,
      buyerClosedAt: true,
      sellerClosedAt: true,
      updatedAt: true,
      opportunity: { select: { id: true, title: true } },
      buyer: { select: { name: true, organization: { select: { name: true } } } },
      offers: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { author: true, preMoneyValue: true, stakePct: true, status: true },
      },
      lois: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { signedByBuyerAt: true, signedBySellerAt: true },
      },
    },
  });
  return rows.map((d): DealRow => {
    const last = d.offers[0] ?? null;
    const loi = d.lois[0] ?? null;
    const actions = dealActionsFor({
      status: d.status,
      party,
      pendingOfferAuthor: last?.status === 'PENDING' ? last.author : null,
      signedLoi: Boolean(party === 'BUYER' ? loi?.signedByBuyerAt : loi?.signedBySellerAt),
      confirmedClose: Boolean(party === 'BUYER' ? d.buyerClosedAt : d.sellerClosedAt),
    });
    return {
      id: d.id,
      opportunityId: d.opportunity.id,
      opportunityTitle: d.opportunity.title,
      buyerName: d.buyer.organization?.name ?? d.buyer.name,
      status: d.status,
      stage: dealStageOf({ accessStatus: 'AUTHORIZED', ndaSigned: true, dealStatus: d.status }),
      lastOffer: last
        ? {
            author: last.author,
            preMoneyLabel: formatCOP(last.preMoneyValue),
            stakePct: last.stakePct,
          }
        : null,
      awaitingMe: actions.some((a) => a !== 'WITHDRAW'),
      updatedAt: d.updatedAt,
    };
  });
}

/** The buyer's active (non-terminal) deal on an opportunity, if any, for the teaser CTA. */
export async function activeDealId(buyerId: string, opportunityId: string): Promise<string | null> {
  const d = await db.deal.findFirst({
    where: { buyerId, opportunityId, status: { notIn: ['CLOSED', 'WITHDRAWN'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  return d?.id ?? null;
}
