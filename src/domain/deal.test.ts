import { describe, expect, it } from 'vitest';
import {
  canAcceptOffer,
  dealActionsFor,
  dealStageOf,
  makeOfferSchema,
  OFFER_SCHEMA,
  type DealParty,
} from './deal';

const NOW = new Date('2026-10-28T12:00:00Z');
const DAY = 86_400_000;
const schema = makeOfferSchema(() => NOW);

const valid = {
  preMoneyValue: '25000',
  stakePct: '40',
  investmentType: 'Socio estratégico',
  paymentScheme: '70% al cierre / 30% a 12 meses',
  exclusivityDays: '90',
  validUntil: new Date(NOW.getTime() + 30 * DAY).toISOString(),
};

describe('canAcceptOffer (P7)', () => {
  it.each<[DealParty, DealParty, boolean]>([
    ['BUYER', 'SELLER', true],
    ['SELLER', 'BUYER', true],
    ['BUYER', 'BUYER', false],
    ['SELLER', 'SELLER', false],
  ])('author %s, actor %s → %s', (author, actor, ok) => {
    expect(canAcceptOffer(author, actor)).toBe(ok);
  });

  it('Back Office and the system never accept', () => {
    expect(canAcceptOffer('BUYER', 'BACKOFFICE')).toBe(false);
    expect(canAcceptOffer('SELLER', 'SYSTEM')).toBe(false);
  });
});

describe('dealStageOf (P8)', () => {
  it('without a deal: contact until authorized with a signed NDA', () => {
    expect(dealStageOf({ accessStatus: null, ndaSigned: false, dealStatus: null })).toBe('CONTACT');
    expect(dealStageOf({ accessStatus: 'NDA_SIGNED', ndaSigned: true, dealStatus: null })).toBe(
      'CONTACT',
    );
    expect(dealStageOf({ accessStatus: 'AUTHORIZED', ndaSigned: false, dealStatus: null })).toBe(
      'CONTACT',
    );
    expect(dealStageOf({ accessStatus: 'AUTHORIZED', ndaSigned: true, dealStatus: null })).toBe(
      'NDA_SIGNED',
    );
  });

  it.each([
    ['OFFER_SENT', 'OFFER'],
    ['COUNTER_OFFER', 'NEGOTIATION'],
    ['PRELIMINARY_AGREEMENT', 'LOI'],
    ['LOI_SIGNED', 'DUE_DILIGENCE'],
    ['DUE_DILIGENCE', 'DUE_DILIGENCE'],
    ['CLOSED', 'CLOSING'],
  ] as const)('%s → %s', (status, stage) => {
    expect(dealStageOf({ accessStatus: 'AUTHORIZED', ndaSigned: true, dealStatus: status })).toBe(
      stage,
    );
  });
});

describe('dealActionsFor', () => {
  const base = { pendingOfferAuthor: null, signedLoi: false, confirmedClose: false } as const;

  it('read-only viewers get no actions', () => {
    expect(dealActionsFor({ ...base, status: 'OFFER_SENT', party: null })).toEqual([]);
  });

  it('the seller counters or accepts a buyer offer; the buyer only withdraws', () => {
    const s = { ...base, status: 'OFFER_SENT', pendingOfferAuthor: 'BUYER' } as const;
    expect(dealActionsFor({ ...s, party: 'SELLER' })).toEqual(['COUNTER', 'ACCEPT', 'WITHDRAW']);
    expect(dealActionsFor({ ...s, party: 'BUYER' })).toEqual(['WITHDRAW']);
  });

  it('hides the LOI signature and close confirmation already given', () => {
    expect(
      dealActionsFor({ ...base, status: 'PRELIMINARY_AGREEMENT', party: 'BUYER', signedLoi: true }),
    ).toEqual(['WITHDRAW']);
    expect(
      dealActionsFor({ ...base, status: 'DUE_DILIGENCE', party: 'SELLER', confirmedClose: true }),
    ).toEqual(['WITHDRAW']);
  });

  it('never offers RENEGOTIATE and nothing in terminal states', () => {
    expect(dealActionsFor({ ...base, status: 'DUE_DILIGENCE', party: 'BUYER' })).toEqual([
      'CONFIRM_CLOSE',
      'WITHDRAW',
    ]);
    expect(dealActionsFor({ ...base, status: 'CLOSED', party: 'BUYER' })).toEqual([]);
    expect(dealActionsFor({ ...base, status: 'WITHDRAWN', party: 'SELLER' })).toEqual([]);
  });
});

describe('OFFER_SCHEMA', () => {
  it('accepts valid terms and coerces form strings', () => {
    const r = schema.parse(valid);
    expect(r.preMoneyValue).toBe(25_000);
    expect(r.stakePct).toBe(40);
    expect(r.exclusivityDays).toBe(90);
    expect(r.validUntil).toBeInstanceOf(Date);
  });

  it.each([
    ['preMoneyValue', '99'],
    ['preMoneyValue', '120.5'],
    ['stakePct', '0.5'],
    ['stakePct', '101'],
    ['investmentType', 'Préstamo'],
    ['paymentScheme', 'abc'],
    ['paymentScheme', 'x'.repeat(121)],
    ['exclusivityDays', '-1'],
    ['exclusivityDays', '181'],
    ['validUntil', NOW.toISOString()],
    ['validUntil', new Date(NOW.getTime() + 181 * DAY).toISOString()],
    ['validUntil', 'no es fecha'],
  ])('rejects %s = %s', (field, value) => {
    const r = schema.safeParse({ ...valid, [field]: value });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual([field]);
  });

  it('the default schema evaluates "now" at parse time', () => {
    const soon = new Date(Date.now() + 10 * DAY).toISOString();
    expect(OFFER_SCHEMA.safeParse({ ...valid, validUntil: soon }).success).toBe(true);
  });
});
