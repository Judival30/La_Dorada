import { describe, expect, it } from 'vitest';
import {
  canAccessConfidential,
  ndaState,
  type ConfidentialAccessContext,
  type NdaInfo,
} from '@/domain/policies/confidential';

const now = new Date('2026-06-15T12:00:00.000Z');
const past = new Date('2026-06-01T12:00:00.000Z');
const future = new Date('2027-06-15T12:00:00.000Z');

const validNda: NdaInfo = { signedAt: past, expiresAt: future };

function baseCtx(): ConfidentialAccessContext {
  return {
    user: { id: 'buyer-1', role: 'BUYER', status: 'ENABLED' },
    opportunity: { sellerId: 'seller-1', status: 'PUBLISHED' },
    access: { status: 'AUTHORIZED' },
    nda: { ...validNda },
    now,
  };
}

describe('ndaState', () => {
  it('returns PENDING when nda is null', () => {
    expect(ndaState(null, now)).toBe('PENDING');
  });

  it('returns PENDING when signedAt is null', () => {
    expect(ndaState({ signedAt: null, expiresAt: future }, now)).toBe('PENDING');
  });

  it('returns PENDING when signedAt is null even if expiresAt is in the past', () => {
    expect(ndaState({ signedAt: null, expiresAt: past }, now)).toBe('PENDING');
  });

  it('returns SIGNED when signed and expiry is in the future', () => {
    expect(ndaState(validNda, now)).toBe('SIGNED');
  });

  it('returns EXPIRED when expiresAt is missing at runtime (fail closed)', () => {
    const noExpiry = { signedAt: past, expiresAt: null } as unknown as NdaInfo;
    expect(ndaState(noExpiry, now)).toBe('EXPIRED');
  });

  it('returns PENDING when signedAt is in the future', () => {
    const later = new Date(now.getTime() + 1);
    expect(ndaState({ signedAt: later, expiresAt: future }, now)).toBe('PENDING');
  });

  it('returns SIGNED when signedAt equals now', () => {
    expect(ndaState({ signedAt: new Date(now.getTime()), expiresAt: future }, now)).toBe('SIGNED');
  });

  it('returns EXPIRED when signedAt equals expiresAt (invalid window)', () => {
    expect(ndaState({ signedAt: past, expiresAt: new Date(past.getTime()) }, now)).toBe('EXPIRED');
  });

  it('returns EXPIRED when signedAt is after expiresAt (invalid window)', () => {
    const exp = new Date(past.getTime() - 1);
    expect(ndaState({ signedAt: past, expiresAt: exp }, now)).toBe('EXPIRED');
  });

  it('never returns SIGNED for an inverted window that is still in the future', () => {
    const signed = new Date(now.getTime() - 10);
    const exp = new Date(now.getTime() - 20);
    expect(ndaState({ signedAt: signed, expiresAt: exp }, now)).toBe('EXPIRED');
    expect(ndaState({ signedAt: future, expiresAt: past }, now)).toBe('EXPIRED');
  });

  it('returns EXPIRED when expiresAt equals now (boundary)', () => {
    expect(ndaState({ signedAt: past, expiresAt: new Date(now.getTime()) }, now)).toBe('EXPIRED');
  });

  it('returns EXPIRED when expiresAt is before now', () => {
    expect(ndaState({ signedAt: past, expiresAt: new Date(now.getTime() - 1) }, now)).toBe(
      'EXPIRED',
    );
  });

  it('returns SIGNED one millisecond before expiry', () => {
    expect(ndaState({ signedAt: past, expiresAt: new Date(now.getTime() + 1) }, now)).toBe(
      'SIGNED',
    );
  });
});

describe('canAccessConfidential', () => {
  it('grants access in the valid base case', () => {
    expect(canAccessConfidential(baseCtx())).toBe(true);
  });

  it('grants access when the opportunity is CLOSED', () => {
    const ctx = baseCtx();
    ctx.opportunity.status = 'CLOSED';
    expect(canAccessConfidential(ctx)).toBe(true);
  });

  it('denies access when the NDA has no expiry (fail closed)', () => {
    const ctx = baseCtx();
    ctx.nda = { signedAt: past, expiresAt: null } as unknown as NdaInfo;
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies access when the NDA is signed in the future', () => {
    const ctx = baseCtx();
    ctx.nda = { signedAt: new Date(now.getTime() + 1), expiresAt: future };
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies access when signedAt equals expiresAt', () => {
    const ctx = baseCtx();
    ctx.nda = { signedAt: future, expiresAt: new Date(future.getTime()) };
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies access when signedAt is after expiresAt', () => {
    const ctx = baseCtx();
    ctx.nda = { signedAt: past, expiresAt: new Date(past.getTime() - 1) };
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies a BLOCKED user', () => {
    const ctx = baseCtx();
    ctx.user.status = 'BLOCKED';
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies a user with role SELLER', () => {
    const ctx = baseCtx();
    ctx.user.role = 'SELLER';
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies a user with role BACKOFFICE', () => {
    const ctx = baseCtx();
    ctx.user.role = 'BACKOFFICE';
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies the seller of the opportunity', () => {
    const ctx = baseCtx();
    ctx.user.id = ctx.opportunity.sellerId;
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies when the opportunity is SUSPENDED', () => {
    const ctx = baseCtx();
    ctx.opportunity.status = 'SUSPENDED';
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies when access is only NDA_SIGNED (not yet authorized)', () => {
    const ctx = baseCtx();
    ctx.access = { status: 'NDA_SIGNED' };
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies when access is REVOKED', () => {
    const ctx = baseCtx();
    ctx.access = { status: 'REVOKED' };
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies when access is null', () => {
    const ctx = baseCtx();
    ctx.access = null;
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies when the NDA expires exactly at now (boundary)', () => {
    const ctx = baseCtx();
    ctx.nda = { signedAt: past, expiresAt: new Date(now.getTime()) };
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies when nda is null', () => {
    const ctx = baseCtx();
    ctx.nda = null;
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it('denies when the NDA is unsigned', () => {
    const ctx = baseCtx();
    ctx.nda = { signedAt: null, expiresAt: future };
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it.each([
    'DRAFT',
    'IN_REVIEW',
    'ADJUSTMENTS_REQUESTED',
    'REJECTED',
    'WITHDRAWN_BY_SELLER',
  ] as const)('denies when the opportunity is %s', (status) => {
    const ctx = baseCtx();
    ctx.opportunity.status = status;
    expect(canAccessConfidential(ctx)).toBe(false);
  });

  it.each(['PENDING', 'IN_REVIEW', 'CORRECTIONS_REQUESTED', 'REJECTED'] as const)(
    'denies a buyer whose status is %s',
    (status) => {
      const ctx = baseCtx();
      ctx.user.status = status;
      expect(canAccessConfidential(ctx)).toBe(false);
    },
  );

  it.each(['REQUESTED', 'REJECTED'] as const)('denies when access is %s', (status) => {
    const ctx = baseCtx();
    ctx.access = { status };
    expect(canAccessConfidential(ctx)).toBe(false);
  });
});
