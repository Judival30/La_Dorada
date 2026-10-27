import { describe, expect, it } from 'vitest';
import { millions } from '@/domain/money';
import { SECTORS, SECTOR_LABELS } from '@/domain/sectors';
import {
  DEFAULT_SCORE_WEIGHTS,
  DEFAULT_SECTOR_MULTIPLES,
  VALUATION_DISCLAIMER,
  cagr,
  computeScore,
  valuationRange,
  type ScoreInput,
  type ScoreWeights,
} from '@/domain/valuation';

describe('sectors', () => {
  it('lists the ten sectors with es-CO labels', () => {
    expect(SECTORS).toHaveLength(10);
    expect(SECTOR_LABELS).toEqual({
      AGROINDUSTRIA: 'Agroindustria',
      ALIMENTOS_BEBIDAS: 'Alimentos y Bebidas',
      LOGISTICA: 'Logística',
      SERVICIOS_FINANCIEROS: 'Servicios Financieros',
      MANUFACTURA: 'Manufactura',
      TECNOLOGIA: 'Tecnología',
      SALUD: 'Salud',
      RETAIL: 'Retail',
      CONSTRUCCION: 'Construcción',
      ENERGIA: 'Energía',
    });
  });

  it('has multiples for every sector with low <= high', () => {
    for (const s of SECTORS) {
      const m = DEFAULT_SECTOR_MULTIPLES[s];
      expect(m.ebitdaLow).toBeLessThanOrEqual(m.ebitdaHigh);
      expect(m.revenueLow).toBeLessThanOrEqual(m.revenueHigh);
    }
    expect(DEFAULT_SECTOR_MULTIPLES.LOGISTICA).toEqual({
      ebitdaLow: 5,
      ebitdaHigh: 7.5,
      revenueLow: 0.6,
      revenueHigh: 1.2,
    });
    expect(DEFAULT_SECTOR_MULTIPLES.TECNOLOGIA).toEqual({
      ebitdaLow: 8,
      ebitdaHigh: 14,
      revenueLow: 2,
      revenueHigh: 5,
    });
  });
});

describe('valuationRange', () => {
  it('uses EBITDA multiples with +10% growth premium when cagr3y > 0.15', () => {
    const ab = DEFAULT_SECTOR_MULTIPLES.ALIMENTOS_BEBIDAS;
    expect(
      valuationRange({ revenue: millions(12000), ebitda: millions(2100), cagr3y: 0.18 }, ab),
    ).toEqual({ low: millions(13900), high: millions(20800), basis: 'EBITDA' });
  });

  it('falls back to revenue multiples when EBITDA <= 0', () => {
    expect(
      valuationRange(
        { revenue: millions(8000), ebitda: millions(-200), cagr3y: 0.4 },
        DEFAULT_SECTOR_MULTIPLES.SERVICIOS_FINANCIEROS,
      ),
    ).toEqual({ low: millions(17600), high: millions(35200), basis: 'REVENUE' });
  });

  it('applies a -10% discount when cagr3y < 0', () => {
    expect(
      valuationRange(
        { revenue: millions(9000), ebitda: millions(1000), cagr3y: -0.05 },
        DEFAULT_SECTOR_MULTIPLES.AGROINDUSTRIA,
      ),
    ).toEqual({ low: millions(4500), high: millions(6300), basis: 'EBITDA' });
  });

  it('uses factor 1 for 0 <= cagr3y <= 0.15 and rounds to COP 100 M', () => {
    // LOGISTICA 5–7.5 × 1.234 M → 6.170 → 6.200 ; 9.255 → 9.300
    expect(
      valuationRange(
        { revenue: millions(10000), ebitda: millions(1234), cagr3y: 0.15 },
        DEFAULT_SECTOR_MULTIPLES.LOGISTICA,
      ),
    ).toEqual({ low: millions(6200), high: millions(9300), basis: 'EBITDA' });
  });

  it('rounds exactly half up (away from zero)', () => {
    // 1.050 M × 1 = 1.050 → 1.100 ; 1.050 × 2 = 2.100
    expect(
      valuationRange(
        { revenue: millions(1050), ebitda: 0n, cagr3y: 0 },
        { ebitdaLow: 1, ebitdaHigh: 2, revenueLow: 1, revenueHigh: 2 },
      ),
    ).toEqual({ low: millions(1100), high: millions(2100), basis: 'REVENUE' });
  });

  it('returns zero range on REVENUE basis when revenue is also <= 0', () => {
    expect(
      valuationRange(
        { revenue: 0n, ebitda: millions(-50), cagr3y: 0.2 },
        DEFAULT_SECTOR_MULTIPLES.RETAIL,
      ),
    ).toEqual({ low: 0n, high: 0n, basis: 'REVENUE' });
    expect(
      valuationRange(
        { revenue: millions(-10), ebitda: 0n, cagr3y: 0 },
        DEFAULT_SECTOR_MULTIPLES.RETAIL,
      ),
    ).toEqual({ low: 0n, high: 0n, basis: 'REVENUE' });
  });
});

describe('cagr', () => {
  it('computes compound annual growth', () => {
    expect(cagr(millions(18000), millions(42000), 4)).toBeCloseTo(0.236, 3);
    expect(cagr(millions(100), millions(100), 3)).toBe(0);
  });

  it('returns -1 when last <= 0', () => {
    expect(cagr(millions(100), 0n, 3)).toBe(-1);
    expect(cagr(millions(100), millions(-5), 3)).toBe(-1);
  });

  it('throws RangeError for invalid years or first <= 0', () => {
    expect(() => cagr(millions(100), millions(200), 0)).toThrow(RangeError);
    expect(() => cagr(millions(100), millions(200), -1)).toThrow(RangeError);
    expect(() => cagr(0n, millions(200), 3)).toThrow(RangeError);
    expect(() => cagr(millions(-1), millions(200), 3)).toThrow(RangeError);
  });
});

describe('computeScore', () => {
  const base: ScoreInput = {
    docsDelivered: 26,
    docsRequired: 30,
    financialConsistency: 'APPROVED',
    cagr3y: 0.18,
    ebitdaMargin: 0.175,
    customerDependency: 'MEDIUM',
    legalContingencies: 'TO_CLARIFY',
  };

  it('exposes the default weights summing to 1', () => {
    expect(DEFAULT_SCORE_WEIGHTS).toEqual({
      infoQuality: 0.3,
      consistency: 0.25,
      growth: 0.15,
      margin: 0.15,
      risks: 0.15,
    });
  });

  it('computes the weighted total and breakdown', () => {
    const s = computeScore(base);
    expect(s.total).toBe(78);
    expect(s.breakdown).toEqual({
      infoQuality: expect.closeTo(86.67, 2),
      consistency: 100,
      growth: 70,
      margin: expect.closeTo(58.33, 2),
      risks: 50,
    });
  });

  it('gives infoQuality 0 when no docs are required', () => {
    expect(computeScore({ ...base, docsRequired: 0, docsDelivered: 0 }).breakdown.infoQuality).toBe(
      0,
    );
  });

  it('clamps infoQuality to 100 when delivered > required', () => {
    expect(computeScore({ ...base, docsDelivered: 40 }).breakdown.infoQuality).toBe(100);
  });

  it('maps consistency statuses', () => {
    expect(
      computeScore({ ...base, financialConsistency: 'TO_CLARIFY' }).breakdown.consistency,
    ).toBe(50);
    expect(computeScore({ ...base, financialConsistency: 'RISK' }).breakdown.consistency).toBe(25);
  });

  it('clamps growth and margin', () => {
    const low = computeScore({ ...base, cagr3y: -0.5, ebitdaMargin: -0.2 }).breakdown;
    expect(low.growth).toBe(0);
    expect(low.margin).toBe(0);
    const high = computeScore({ ...base, cagr3y: 0.9, ebitdaMargin: 0.6 }).breakdown;
    expect(high.growth).toBe(100);
    expect(high.margin).toBe(100);
  });

  it('averages risk levels', () => {
    expect(
      computeScore({ ...base, customerDependency: 'LOW', legalContingencies: 'HIGH' }).breakdown
        .risks,
    ).toBe(60);
    expect(
      computeScore({ ...base, customerDependency: 'LOW', legalContingencies: 'LOW' }).breakdown
        .risks,
    ).toBe(100);
  });

  it('accepts custom weights', () => {
    const onlyConsistency: ScoreWeights = {
      infoQuality: 0,
      consistency: 1,
      growth: 0,
      margin: 0,
      risks: 0,
    };
    expect(computeScore({ ...base, financialConsistency: 'RISK' }, onlyConsistency).total).toBe(25);
  });
});

describe('VALUATION_DISCLAIMER', () => {
  it('states the orientative nature', () => {
    expect(VALUATION_DISCLAIMER).toBe(
      'Orientativo. No es asesoría financiera regulada ni obliga a comprar o vender.',
    );
  });
});
