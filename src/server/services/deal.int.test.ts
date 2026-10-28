import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loiHash, loiText } from '@/content/loi';
import {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  ValidationError,
} from '@/domain/errors';
import type { OfferInput } from '@/domain/deal';
import type { DealStatus } from '@/domain/machines/deal';
import { millions } from '@/domain/money';
import type { SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { resetAdaptersForTests as resetMail } from '@/server/mail';
import { resetAdaptersForTests as resetStorage } from '@/server/storage';
import { cleanupTestUsers, createTestUser } from '@/test/onboarding-fixtures';
import { seed } from '../../../prisma/seed';
import { decideAccess, requestAccess, signNda } from './access';
import {
  acceptOffer,
  confirmClose,
  counterOffer,
  getDeal,
  listDeals,
  makeOffer,
  signLoi,
  startDueDiligence,
  withdraw,
} from './deal';
import { searchMarketplace } from './marketplace';

const tag = `deal${randomUUID().slice(0, 8)}`;
const DAY = 86_400_000;
const PURPOSE = 'Fondo interesado en alimentos de valor agregado y en su expansión regional.';
const CTX = { ip: '10.0.0.1', userAgent: 'vitest' };

const terms = (o: Partial<Record<keyof OfferInput, string>> = {}): OfferInput => ({
  preMoneyValue: '25000',
  stakePct: '40',
  investmentType: 'Socio estratégico',
  paymentScheme: '70% al cierre / 30% a 12 meses',
  exclusivityDays: '90',
  validUntil: new Date(Date.now() + 30 * DAY).toISOString(),
  ...o,
});

const session = async (id: string): Promise<SessionUser> => {
  const row = await db.user.findUniqueOrThrow({ where: { id } });
  return { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status };
};

let oppId: string;
let seller: SessionUser;
let bo: SessionUser;

const newUser = async (role: 'BUYER' | 'SELLER' | 'BACKOFFICE') =>
  session((await createTestUser(tag, role, 'ENABLED')).id);

/** A buyer with an AUTHORIZED request and a valid NDA on the seeded opportunity. */
async function authorizedBuyer(): Promise<SessionUser> {
  const buyer = await newUser('BUYER');
  const { id } = await requestAccess(buyer, oppId, { purpose: PURPOSE });
  await signNda(buyer, id, CTX);
  await decideAccess(seller, id, 'APPROVE');
  return buyer;
}

const statusOf = async (dealId: string): Promise<DealStatus> =>
  (await db.deal.findUniqueOrThrow({ where: { id: dealId } })).status;

/** Drives a fresh deal to `target` with a fresh authorized buyer. */
async function dealAt(target: DealStatus): Promise<{ dealId: string; buyer: SessionUser }> {
  const buyer = await authorizedBuyer();
  const { dealId } = await makeOffer(buyer, oppId, terms());
  if (target === 'OFFER_SENT') return { dealId, buyer };
  await counterOffer(seller, dealId, terms({ stakePct: '35' }));
  if (target === 'COUNTER_OFFER') return { dealId, buyer };
  await acceptOffer(buyer, dealId);
  if (target === 'PRELIMINARY_AGREEMENT') return { dealId, buyer };
  await signLoi(buyer, dealId);
  await signLoi(seller, dealId);
  if (target === 'LOI_SIGNED') return { dealId, buyer };
  await startDueDiligence(seller, dealId);
  return { dealId, buyer };
}

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  process.env.MAIL_DRIVER = 'memory';
  resetMail();
  process.env.STORAGE_DRIVER = 'memory';
  resetStorage();
  await seed(db);
  const opp = await db.opportunity.findFirstOrThrow({
    where: { company: { slug: 'cafes-de-antioquia' } },
  });
  oppId = opp.id;
  seller = await session(opp.sellerId);
  bo = await newUser('BACKOFFICE');
});

afterAll(async () => {
  const users = await db.user.findMany({
    where: { email: { contains: tag } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const deals = await db.deal.findMany({ where: { buyerId: { in: ids } }, select: { id: true } });
  const dealIds = deals.map((d) => d.id);
  if (dealIds.length > 0) {
    await db.notification.deleteMany({
      where: { OR: dealIds.map((id) => ({ payload: { path: ['dealId'], equals: id } })) },
    });
  }
  await db.loi.deleteMany({ where: { dealId: { in: dealIds } } });
  await db.offer.updateMany({ where: { dealId: { in: dealIds } }, data: { parentOfferId: null } });
  await db.offer.deleteMany({ where: { dealId: { in: dealIds } } });
  await db.deal.deleteMany({ where: { id: { in: dealIds } } });
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
  await db.opportunity.update({ where: { id: oppId }, data: { status: 'PUBLISHED' } });
  await cleanupTestUsers(tag);
  await db.$disconnect();
});

describe('R4: Back Office never transitions a deal', () => {
  it('every mutation throws ForbiddenError and nothing changes; reading is allowed', async () => {
    const { dealId } = await dealAt('OFFER_SENT');
    const calls: [string, () => Promise<unknown>][] = [
      ['makeOffer', () => makeOffer(bo, oppId, terms())],
      ['counterOffer', () => counterOffer(bo, dealId, terms())],
      ['acceptOffer', () => acceptOffer(bo, dealId)],
      ['signLoi', () => signLoi(bo, dealId)],
      ['startDueDiligence', () => startDueDiligence(bo, dealId)],
      ['confirmClose', () => confirmClose(bo, dealId)],
      ['withdraw', () => withdraw(bo, dealId, 'motivo')],
    ];
    for (const [name, call] of calls) {
      await expect(call(), name).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await statusOf(dealId)).toBe('OFFER_SENT');
    expect(await db.offer.count({ where: { dealId } })).toBe(1);

    const view = await getDeal(bo, dealId);
    expect(view.viewer).toBe('BACKOFFICE');
    expect(view.actions).toEqual([]);
  });

  it('also on a deal waiting for close confirmations', async () => {
    const { dealId } = await dealAt('DUE_DILIGENCE');
    await expect(confirmClose(bo, dealId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(withdraw(bo, dealId)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await statusOf(dealId)).toBe('DUE_DILIGENCE');
  });
});

describe('P7: only the counterparty accepts', () => {
  it('the buyer cannot accept their own offer', async () => {
    const { dealId, buyer } = await dealAt('OFFER_SENT');
    await expect(acceptOffer(buyer, dealId)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await statusOf(dealId)).toBe('OFFER_SENT');
    expect((await getDeal(buyer, dealId)).actions).toEqual(['WITHDRAW']);
  });

  it('the seller cannot accept their own counter-offer', async () => {
    const { dealId, buyer } = await dealAt('COUNTER_OFFER');
    await expect(acceptOffer(seller, dealId)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await statusOf(dealId)).toBe('COUNTER_OFFER');
    expect((await getDeal(seller, dealId)).actions).toEqual(['WITHDRAW']);
    expect((await getDeal(buyer, dealId)).actions).toEqual(['COUNTER', 'ACCEPT', 'WITHDRAW']);
  });

  it('the buyer cannot use counterOffer; only the owning seller can', async () => {
    const { dealId, buyer } = await dealAt('OFFER_SENT');
    await expect(counterOffer(buyer, dealId, terms())).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('full flow', () => {
  it('offer → counter → accept → LOI by both → DD → close by both', async () => {
    const buyer = await authorizedBuyer();
    const { dealId } = await makeOffer(buyer, oppId, terms());
    expect(await statusOf(dealId)).toBe('OFFER_SENT');

    await counterOffer(seller, dealId, terms({ stakePct: '35', exclusivityDays: '60' }));
    expect(await statusOf(dealId)).toBe('COUNTER_OFFER');

    // The buyer counters again through makeOffer (same deal, no second Deal row).
    const again = await makeOffer(buyer, oppId, terms({ stakePct: '37.5', exclusivityDays: '75' }));
    expect(again.dealId).toBe(dealId);
    expect(await statusOf(dealId)).toBe('OFFER_SENT');
    expect(await db.deal.count({ where: { buyerId: buyer.id } })).toBe(1);

    await acceptOffer(seller, dealId);
    expect(await statusOf(dealId)).toBe('PRELIMINARY_AGREEMENT');

    const offers = await db.offer.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } });
    expect(offers.map((o) => [o.author, o.status])).toEqual([
      ['BUYER', 'COUNTERED'],
      ['SELLER', 'COUNTERED'],
      ['BUYER', 'ACCEPTED'],
    ]);
    expect(offers[1]?.parentOfferId).toBe(offers[0]?.id);
    expect(offers[2]?.parentOfferId).toBe(offers[1]?.id);
    const accepted = offers[2]!;
    expect(accepted.preMoneyValue).toBe(millions(25_000));

    const loi = await db.loi.findUniqueOrThrow({ where: { offerId: accepted.id } });
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: oppId } });
    expect(loi.documentHash).toBe(
      loiHash(
        loiText({
          dealId,
          offerId: accepted.id,
          opportunityTitle: opp.title,
          preMoneyValue: accepted.preMoneyValue,
          stakePct: accepted.stakePct,
          investmentType: accepted.investmentType,
          paymentScheme: accepted.paymentScheme,
          exclusivityDays: accepted.exclusivityDays,
          validUntil: accepted.validUntil,
        }),
      ),
    );
    const view = await getDeal(buyer, dealId);
    expect(view.loi?.documentHash).toBe(loi.documentHash);
    expect(view.loi?.text).toContain('NO VINCULANTE');

    await signLoi(buyer, dealId);
    expect(await statusOf(dealId)).toBe('PRELIMINARY_AGREEMENT');
    await expect(signLoi(buyer, dealId)).rejects.toBeInstanceOf(InvalidTransitionError);
    await signLoi(seller, dealId);
    expect(await statusOf(dealId)).toBe('LOI_SIGNED');

    await startDueDiligence(buyer, dealId);
    expect(await statusOf(dealId)).toBe('DUE_DILIGENCE');

    await confirmClose(seller, dealId);
    expect(await statusOf(dealId)).toBe('DUE_DILIGENCE');
    await expect(confirmClose(seller, dealId)).rejects.toBeInstanceOf(InvalidTransitionError);
    await confirmClose(buyer, dealId);

    const closed = await db.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(closed.status).toBe('CLOSED');
    expect(closed.buyerClosedAt).not.toBeNull();
    expect(closed.sellerClosedAt).not.toBeNull();
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: oppId } })).status).toBe(
      'CLOSED',
    );
    const market = await searchMarketplace(buyer, {});
    expect(market.items.some((i) => i.id === oppId)).toBe(false);

    const kinds = await db.notification.findMany({
      where: { kind: 'DEAL_CLOSED', payload: { path: ['dealId'], equals: dealId } },
      select: { userId: true },
    });
    expect(kinds.map((k) => k.userId).sort()).toEqual([buyer.id, seller.id].sort());

    const audit = await db.auditLog.findMany({
      where: { entity: 'Deal', entityId: dealId },
      orderBy: { seq: 'asc' },
      select: { action: true },
    });
    expect(audit.map((a) => a.action)).toEqual([
      'OFFER_SUBMITTED',
      'OFFER_COUNTERED',
      'OFFER_COUNTERED',
      'OFFER_ACCEPTED',
      'LOI_SIGNED',
      'LOI_SIGNED',
      'DUE_DILIGENCE_STARTED',
      'DEAL_CLOSE_CONFIRMED',
      'DEAL_CLOSE_CONFIRMED',
    ]);
    expect(
      await db.auditLog.count({
        where: { action: 'OPPORTUNITY_CLOSED', entityId: oppId, actorId: null },
      }),
    ).toBe(1);

    // A closed deal cannot be reopened with a new offer.
    await expect(makeOffer(buyer, oppId, terms())).rejects.toThrow();

    // Restore the shared seeded opportunity for the remaining tests.
    await db.opportunity.update({ where: { id: oppId }, data: { status: 'PUBLISHED' } });
  });
});

describe('R5: withdrawal from every non-terminal state', () => {
  it.each<[DealStatus, 'BUYER' | 'SELLER']>([
    ['OFFER_SENT', 'BUYER'],
    ['COUNTER_OFFER', 'SELLER'],
    ['PRELIMINARY_AGREEMENT', 'BUYER'],
    ['LOI_SIGNED', 'SELLER'],
    ['DUE_DILIGENCE', 'BUYER'],
  ])('from %s by the %s', async (state, who) => {
    const { dealId, buyer } = await dealAt(state);
    const actor = who === 'BUYER' ? buyer : seller;
    await withdraw(actor, dealId, 'Cambio de prioridades de inversión.');
    expect(await statusOf(dealId)).toBe('WITHDRAWN');
    expect(await db.offer.count({ where: { dealId, status: 'PENDING' } })).toBe(0);
    await expect(withdraw(actor, dealId)).rejects.toBeInstanceOf(InvalidTransitionError);

    // The reason lives only in the counterparty's notification, never in AuditLog.
    const row = await db.auditLog.findFirstOrThrow({
      where: { action: 'DEAL_WITHDRAWN', entityId: dealId },
    });
    expect(JSON.stringify([row.before, row.after])).not.toContain('prioridades');
    const counterparty = who === 'BUYER' ? seller.id : buyer.id;
    const n = await db.notification.findFirstOrThrow({
      where: {
        userId: counterparty,
        kind: 'DEAL_WITHDRAWN',
        payload: { path: ['dealId'], equals: dealId },
      },
    });
    expect(n.payload).toMatchObject({ reason: 'Cambio de prioridades de inversión.' });
  });

  it('after withdrawing, the buyer may start a new deal', async () => {
    const { dealId, buyer } = await dealAt('OFFER_SENT');
    await withdraw(buyer, dealId);
    const next = await makeOffer(buyer, oppId, terms());
    expect(next.dealId).not.toBe(dealId);
    expect(await statusOf(next.dealId)).toBe('OFFER_SENT');
  });

  it('rejects a reason longer than 500 characters', async () => {
    const { dealId, buyer } = await dealAt('OFFER_SENT');
    await expect(withdraw(buyer, dealId, 'x'.repeat(501))).rejects.toBeInstanceOf(ValidationError);
    expect(await statusOf(dealId)).toBe('OFFER_SENT');
  });
});

describe('making offers', () => {
  it('a buyer without authorized access and a valid NDA cannot make an offer', async () => {
    const stranger = await newUser('BUYER');
    await expect(makeOffer(stranger, oppId, terms())).rejects.toBeInstanceOf(ForbiddenError);

    const signedOnly = await newUser('BUYER');
    const { id } = await requestAccess(signedOnly, oppId, { purpose: PURPOSE });
    await signNda(signedOnly, id, CTX);
    await expect(makeOffer(signedOnly, oppId, terms())).rejects.toBeInstanceOf(ForbiddenError);

    expect(await db.deal.count({ where: { buyerId: { in: [stranger.id, signedOnly.id] } } })).toBe(
      0,
    );
  });

  it('a seller cannot make an offer on any opportunity', async () => {
    await expect(makeOffer(seller, oppId, terms())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('invalid terms are a ValidationError in Spanish', async () => {
    const buyer = await authorizedBuyer();
    await expect(makeOffer(buyer, oppId, terms({ preMoneyValue: '50' }))).rejects.toThrow(
      /valoración mínima/,
    );
    await expect(makeOffer(buyer, oppId, terms({ stakePct: '0' }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('a buyer cannot counter while waiting for the seller', async () => {
    const { buyer } = await dealAt('OFFER_SENT');
    await expect(makeOffer(buyer, oppId, terms())).rejects.toBeInstanceOf(InvalidTransitionError);
  });
});

describe('authorization', () => {
  it('a third party gets 404 on reads and mutations', async () => {
    const { dealId } = await dealAt('COUNTER_OFFER');
    const otherBuyer = await authorizedBuyer();
    const otherSeller = await newUser('SELLER');
    for (const actor of [otherBuyer, otherSeller]) {
      await expect(getDeal(actor, dealId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(acceptOffer(actor, dealId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(withdraw(actor, dealId)).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(counterOffer(otherSeller, dealId, terms())).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDeal(otherBuyer, 'does-not-exist')).rejects.toBeInstanceOf(NotFoundError);
    expect(await statusOf(dealId)).toBe('COUNTER_OFFER');
  });

  it('the seller lists deals on their own opportunities only', async () => {
    const { dealId } = await dealAt('OFFER_SENT');
    expect((await listDeals(seller)).some((d) => d.id === dealId)).toBe(true);
    expect(await listDeals(await newUser('SELLER'))).toEqual([]);
  });
});

describe('concurrency', () => {
  it('two concurrent accepts: exactly one wins, the other is InvalidTransition', async () => {
    const { dealId } = await dealAt('OFFER_SENT');
    const results = await Promise.allSettled([
      acceptOffer(seller, dealId),
      acceptOffer(seller, dealId),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected');
    expect(failed?.status === 'rejected' && failed.reason).toBeInstanceOf(InvalidTransitionError);
    expect(await statusOf(dealId)).toBe('PRELIMINARY_AGREEMENT');
    expect(await db.loi.count({ where: { dealId } })).toBe(1);
  });

  it('two concurrent LOI signatures by both parties end in LOI_SIGNED once', async () => {
    const { dealId, buyer } = await dealAt('PRELIMINARY_AGREEMENT');
    await Promise.all([signLoi(buyer, dealId), signLoi(seller, dealId)]);
    expect(await statusOf(dealId)).toBe('LOI_SIGNED');
    expect(
      await db.auditLog.count({
        where: {
          action: 'LOI_SIGNED',
          entityId: dealId,
          after: { path: ['status'], equals: 'LOI_SIGNED' },
        },
      }),
    ).toBe(1);
  });
});
