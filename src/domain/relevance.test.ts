import { describe, expect, it } from 'vitest';
import { millions } from '@/domain/money';
import { DEFAULT_RELEVANCE, computeRelevance } from './relevance';

const opp = {
  sector: 'AGROINDUSTRIA' as const,
  department: 'Antioquia',
  dealSizeMin: millions(5000),
  dealSizeMax: millions(12000),
};

describe('computeRelevance', () => {
  it('defaults to 50 without preferences', () => {
    expect(computeRelevance(null, opp)).toBe(DEFAULT_RELEVANCE);
  });

  it('adds sector 50 + region 30 + ticket 20', () => {
    expect(
      computeRelevance(
        {
          sectors: ['AGROINDUSTRIA'],
          regions: ['antioquia'],
          ticketMin: millions(10000),
          ticketMax: millions(20000),
        },
        opp,
      ),
    ).toBe(100);
  });

  it('scores each part independently', () => {
    const base = { sectors: [], regions: [], ticketMin: null, ticketMax: null };
    expect(computeRelevance({ ...base, sectors: ['AGROINDUSTRIA'] }, opp)).toBe(50);
    expect(computeRelevance({ ...base, regions: ['Antioquia'] }, opp)).toBe(30);
    expect(
      computeRelevance({ ...base, ticketMin: millions(1000), ticketMax: millions(5000) }, opp),
    ).toBe(20);
    expect(computeRelevance({ ...base, ticketMax: millions(1000) }, opp)).toBe(0);
    expect(computeRelevance(base, opp)).toBe(0);
  });

  it('no ticket points when the opportunity has no deal size', () => {
    const p = { sectors: [], regions: [], ticketMin: millions(1), ticketMax: millions(2) };
    expect(computeRelevance(p, { ...opp, dealSizeMin: null, dealSizeMax: null })).toBe(0);
  });
});
