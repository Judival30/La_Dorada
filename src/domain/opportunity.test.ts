import { describe, expect, it } from 'vitest';
import { millions } from './money';
import {
  CODENAME_WORDS,
  DEAL_SIZE_RANGES,
  HORIZONS,
  OBJECTIVES,
  OPPORTUNITY_SCHEMA,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  dealSizeBounds,
  dealSizeRangeOf,
  generateCodename,
  opportunityReadiness,
  type OpportunitySnapshot,
} from './opportunity';

describe('catalogs (slide09)', () => {
  it('labels every opportunity type with its slide09 description', () => {
    expect(OPPORTUNITY_TYPES).toEqual([
      'VENTA_TOTAL',
      'VENTA_PARCIAL',
      'LEVANTAMIENTO_CAPITAL',
      'SOCIO_ESTRATEGICO',
    ]);
    expect(OPPORTUNITY_TYPE_LABELS.VENTA_TOTAL).toEqual({
      label: 'Venta total',
      description: 'Vendo el 100% de la empresa.',
    });
    expect(OPPORTUNITY_TYPE_LABELS.SOCIO_ESTRATEGICO.label).toBe('Socio estratégico');
  });

  it('exposes horizons, objectives and four deal size ranges', () => {
    expect(HORIZONS).toEqual([
      'Menos de 6 meses',
      '6 a 12 meses',
      '12 a 24 meses',
      'Más de 24 meses',
    ]);
    expect(OBJECTIVES.length).toBeGreaterThanOrEqual(5);
    expect(DEAL_SIZE_RANGES.map((r) => [r.minMillions, r.maxMillions])).toEqual([
      [0, 5000],
      [5000, 20000],
      [20000, 50000],
      [50000, null],
    ]);
  });
});

describe('deal size ranges', () => {
  it('converts a range key into bounds in pesos', () => {
    expect(dealSizeBounds('5K_20K')).toEqual({ min: millions(5000), max: millions(20000) });
    expect(dealSizeBounds('OVER_50K')).toEqual({ min: millions(50000), max: null });
  });

  it('maps stored bounds back to a range (exact or by midpoint)', () => {
    expect(dealSizeRangeOf(millions(0), millions(5000))).toBe('UNDER_5K');
    expect(dealSizeRangeOf(millions(50000), null)).toBe('OVER_50K');
    expect(dealSizeRangeOf(millions(8400), millions(12600))).toBe('5K_20K');
    expect(dealSizeRangeOf(millions(30000), null)).toBe('20K_50K');
    expect(dealSizeRangeOf(null, millions(3000))).toBe('UNDER_5K');
    expect(dealSizeRangeOf(millions(90000), millions(120000))).toBe('OVER_50K');
    expect(dealSizeRangeOf(null, null)).toBeNull();
  });
});

describe('OPPORTUNITY_SCHEMA', () => {
  const ok = {
    type: 'VENTA_PARCIAL',
    objective: OBJECTIVES[1],
    dealSizeRange: '5K_20K',
    horizon: '6 a 12 meses',
    idealBuyerProfile: 'Fondo con experiencia en consumo masivo y capacidad de expansión.',
    title: 'Proyecto Cóndor',
  };

  it('accepts slide09 data', () => {
    expect(OPPORTUNITY_SCHEMA.parse(ok)).toEqual(ok);
  });

  it('validates each field', () => {
    expect(OPPORTUNITY_SCHEMA.safeParse({ ...ok, type: 'FUSION' }).success).toBe(false);
    expect(OPPORTUNITY_SCHEMA.safeParse({ ...ok, objective: 'Otro' }).success).toBe(false);
    expect(OPPORTUNITY_SCHEMA.safeParse({ ...ok, dealSizeRange: '1K' }).success).toBe(false);
    expect(OPPORTUNITY_SCHEMA.safeParse({ ...ok, horizon: 'Pronto' }).success).toBe(false);
    expect(OPPORTUNITY_SCHEMA.safeParse({ ...ok, idealBuyerProfile: 'Corto' }).success).toBe(false);
    expect(
      OPPORTUNITY_SCHEMA.safeParse({ ...ok, idealBuyerProfile: 'x'.repeat(501) }).success,
    ).toBe(false);
    expect(OPPORTUNITY_SCHEMA.safeParse({ ...ok, title: 'PC' }).success).toBe(false);
    expect(OPPORTUNITY_SCHEMA.safeParse({ ...ok, title: 'x'.repeat(61) }).success).toBe(false);
  });

  it('rejects a codename that carries NIT-like digits', () => {
    for (const title of ['Proyecto 900123456', 'Proyecto 900.123.456-8', 'Cóndor 900 123']) {
      const r = OPPORTUNITY_SCHEMA.safeParse({ ...ok, title });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toMatch(/NIT/);
    }
    expect(OPPORTUNITY_SCHEMA.safeParse({ ...ok, title: 'Proyecto Cóndor 2026' }).success).toBe(
      true,
    );
  });
});

describe('generateCodename', () => {
  it('has 40 distinct nature words', () => {
    expect(CODENAME_WORDS).toHaveLength(40);
    expect(new Set(CODENAME_WORDS).size).toBe(40);
    expect(CODENAME_WORDS).toContain('Cóndor');
  });

  it('is deterministic and of the form "Proyecto <word>"', () => {
    const a = generateCodename('opp_123');
    expect(a).toBe(generateCodename('opp_123'));
    expect(a).toMatch(/^Proyecto /);
    expect(CODENAME_WORDS).toContain(a.slice('Proyecto '.length));
  });

  it('spreads different seeds across the list', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => generateCodename(`seed-${i}`)));
    expect(names.size).toBeGreaterThan(20);
  });
});

describe('opportunityReadiness', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  const full = (): OpportunitySnapshot => ({
    company: {
      description: 'Productor y comercializador de cafés especiales con presencia nacional.',
      sector: 'ALIMENTOS_BEBIDAS',
      subsector: 'Cafés especiales',
      foundedYear: 2015,
      employeesRange: '11 - 50',
      department: 'Antioquia',
      city: 'Medellín',
    },
    financialYears: [{ year: 2023 }, { year: 2024 }, { year: 2025 }],
    folders: [
      { name: 'Estados financieros', required: true, documentCount: 2 },
      { name: 'Permisos y cumplimiento', required: false, documentCount: 0 },
    ],
    opportunity: {
      title: 'Proyecto Cóndor',
      type: 'VENTA_PARCIAL',
      objective: OBJECTIVES[0],
      dealSizeMin: millions(5000),
      dealSizeMax: millions(20000),
      horizon: '6 a 12 meses',
      idealBuyerProfile: 'Fondo con experiencia en consumo masivo.',
    },
    visibility: [
      { section: 'SUMMARY', inTeaser: true },
      { section: 'FINANCIAL_STATEMENTS', inTeaser: false },
    ],
    hasTeaserImage: true,
  });

  it('is complete when nothing is missing', () => {
    expect(opportunityReadiness(full(), now)).toEqual({ complete: true, missing: [] });
  });

  it('lists every area, with a reason, for an empty snapshot', () => {
    const r = opportunityReadiness(
      {
        company: null,
        financialYears: [],
        folders: [],
        opportunity: {
          title: '',
          type: null,
          objective: null,
          dealSizeMin: null,
          dealSizeMax: null,
          horizon: null,
          idealBuyerProfile: null,
        },
        visibility: [],
        hasTeaserImage: false,
      },
      now,
    );
    expect(r.complete).toBe(false);
    expect(r.missing.map((m) => m.area)).toEqual([
      'company',
      'financials',
      'documents',
      'opportunity',
      'visibility',
      'teaser',
    ]);
    for (const m of r.missing) expect(m.reason.length).toBeGreaterThan(30);
    expect(r.missing[1]?.reason).toBe(
      'Faltan los estados financieros de al menos 3 años consecutivos para estimar la valoración.',
    );
  });

  it('names the missing company fields and required folders', () => {
    const s = full();
    s.company = { ...s.company!, subsector: '  ', foundedYear: null };
    s.folders = [
      { name: 'Estados financieros', required: true, documentCount: 0 },
      { name: 'Contratos', required: true, documentCount: 0 },
      { name: 'Clientes', required: false, documentCount: 0 },
    ];
    const r = opportunityReadiness(s, now);
    const byArea = Object.fromEntries(r.missing.map((m) => [m.area, m.reason]));
    expect(byArea.company).toMatch(/subsector, año de fundación/);
    expect(byArea.documents).toMatch(/Estados financieros, Contratos/);
    expect(byArea.documents).not.toMatch(/Clientes/);
  });

  it('names missing opportunity fields and asks for at least one teaser section', () => {
    const s = full();
    s.opportunity = { ...s.opportunity, horizon: null, dealSizeMin: null, dealSizeMax: null };
    s.visibility = [{ section: 'SUMMARY', inTeaser: false }];
    const r = opportunityReadiness(s, now);
    const byArea = Object.fromEntries(r.missing.map((m) => [m.area, m.reason]));
    expect(byArea.opportunity).toMatch(/tamaño de la transacción, horizonte/);
    expect(byArea.visibility).toMatch(/al menos una sección/);
  });

  it('flags confidential sections placed in the teaser', () => {
    const s = full();
    s.visibility = [
      { section: 'SUMMARY', inTeaser: true },
      { section: 'LITIGATION', inTeaser: true },
    ];
    const r = opportunityReadiness(s, now);
    expect(r.missing).toEqual([
      { area: 'visibility', reason: expect.stringMatching(/Litigios y contingencias/) },
    ]);
  });

  it('rejects outdated financial years with the financials reason', () => {
    const s = full();
    s.financialYears = [{ year: 2020 }, { year: 2021 }, { year: 2022 }];
    expect(opportunityReadiness(s, now).missing.map((m) => m.area)).toEqual(['financials']);
  });
});
