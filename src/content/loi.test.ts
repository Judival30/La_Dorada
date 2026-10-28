import { describe, expect, it } from 'vitest';
import { millions } from '@/domain/money';
import { loiHash, loiText, type LoiTerms } from './loi';

const terms: LoiTerms = {
  dealId: 'deal1',
  offerId: 'offer1',
  opportunityTitle: 'Cafés de Antioquia',
  preMoneyValue: millions(25_000),
  stakePct: 37.5,
  investmentType: 'Socio estratégico',
  paymentScheme: '60% al cierre / 40% a 18 meses',
  exclusivityDays: 60,
  validUntil: new Date('2026-11-30T15:00:00Z'),
};

describe('LOI text', () => {
  it('is marked as a non-binding reference document and carries the terms', () => {
    const t = loiText(terms);
    expect(t).toContain('DOCUMENTO DE REFERENCIA, NO VINCULANTE');
    expect(t).toContain('COP 25.000 M');
    expect(t).toContain('37,5 %');
    expect(t).toContain('60 días');
    expect(t).toContain('30 nov 2026');
  });

  it('is deterministic, and the hash changes with any term', () => {
    expect(loiHash(loiText(terms))).toBe(loiHash(loiText({ ...terms })));
    expect(loiHash(loiText(terms))).toMatch(/^[0-9a-f]{64}$/);
    expect(loiHash(loiText({ ...terms, stakePct: 38 }))).not.toBe(loiHash(loiText(terms)));
  });
});
