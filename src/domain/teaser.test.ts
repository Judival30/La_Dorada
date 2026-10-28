import { describe, expect, it } from 'vitest';
import { millions } from './money';
import { revenueBucket, scrubIdentity, toTeaser, type TeaserSource } from './teaser';
import { VALUATION_DISCLAIMER } from './valuation';
import { INFO_SECTIONS } from './visibility';

const NOW = new Date('2026-06-01T12:00:00Z');

const allInTeaser = INFO_SECTIONS.map((section) => ({ section, inTeaser: true, inDataRoom: true }));

const source = (over: Partial<TeaserSource> = {}): TeaserSource => ({
  id: 'opp_1',
  title: 'Proyecto Cóndor',
  type: 'VENTA_PARCIAL',
  objective: 'Financiar la expansión de la planta de Cafés de Antioquia en Medellín.',
  idealBuyerProfile: 'Fondo con experiencia; contacto Cafés de Antioquia S.A.S.',
  dealSizeMin: millions(8400),
  dealSizeMax: millions(12600),
  horizon: '6 a 12 meses',
  sector: 'ALIMENTOS_BEBIDAS',
  subsector: 'Cafés especiales (Medellín)',
  department: 'Antioquia',
  city: 'Medellín',
  legalName: 'Cafés de Antioquia S.A.S.',
  nit: '900.101.001-1',
  description:
    'CAFES DE ANTIOQUIA S.A.S. (NIT 900.101.001-1, también 9001010011) es una tostadora con ' +
    'sede en medellin y ventas por COP 12.000 M; Cafés de Antioquia exporta café de alta calidad.',
  employeesRange: '51 - 200',
  foundedYear: 2009,
  channels: ['Supermercados de Medellín', 'Exportación'],
  capacity: 'Planta de 40 toneladas/mes',
  financials: [
    { year: 2023, revenue: millions(10100) },
    { year: 2021, revenue: millions(8200) },
    { year: 2025, revenue: millions(12000) },
    { year: 2022, revenue: millions(9100) },
    { year: 2024, revenue: millions(11000) },
  ],
  visibility: allInTeaser,
  teaserImageUrl: '/api/opportunities/opp_1/teaser-image',
  evaluation: null,
  ...over,
});

describe('toTeaser — anonymity (R2(b))', () => {
  const json = JSON.stringify(toTeaser(source(), NOW));

  it.each([
    ['legal name', 'Cafés de Antioquia'],
    ['legal name without accent', 'cafes de antioquia'],
    ['NIT with dots', '900.101.001'],
    ['NIT digits', '900101001'],
    ['city', 'Medellín'],
    ['city without accent', 'medellin'],
    ['exact revenue', '12.000'],
    ['exact revenue (older year)', '8.200'],
    ['exact deal size', '8.400'],
  ])('never contains the %s', (_what, needle) => {
    expect(json.toLowerCase()).not.toContain(needle.toLowerCase());
  });

  it('replaces the company name with "la empresa" and keeps unrelated words', () => {
    const t = toTeaser(source(), NOW);
    const text = t.sections.BUSINESS?.text ?? '';
    expect(text).toMatch(/^la empresa \(.*\) es una tostadora con sede en la región/);
    expect(text).toContain('la empresa exporta café de alta calidad.');
    expect(text).toContain('cifra reservada');
    expect(text).not.toMatch(/NIT/);
    expect(t.sections.SUMMARY?.text).toBe(
      'Financiar la expansión de la planta de la empresa en la región.',
    );
  });

  it('is JSON-serializable (no bigint) and never exposes idealBuyerProfile', () => {
    const t = toTeaser(source({ evaluation: { valuationLow: 1n, valuationHigh: 2n, score: 7 } }));
    expect(() => JSON.stringify(t)).not.toThrow();
    expect(JSON.stringify(t)).not.toContain('Fondo con experiencia');
  });
});

describe('toTeaser — sections', () => {
  it('exposes header fields', () => {
    const t = toTeaser(source(), NOW);
    expect(t).toMatchObject({
      id: 'opp_1',
      title: 'Proyecto Cóndor',
      type: 'VENTA_PARCIAL',
      typeLabel: 'Venta parcial',
      sector: 'ALIMENTOS_BEBIDAS',
      sectorLabel: 'Alimentos y Bebidas',
      department: 'Antioquia',
      teaserImageUrl: '/api/opportunities/opp_1/teaser-image',
      evaluation: null,
    });
  });

  it('maps SUMMARY, BUSINESS, REVENUE and OPERATIONS', () => {
    const { sections } = toTeaser(source(), NOW);
    expect(Object.keys(sections)).toEqual(['SUMMARY', 'BUSINESS', 'REVENUE', 'OPERATIONS']);
    expect(sections.SUMMARY).toEqual({
      title: 'Resumen ejecutivo',
      text: 'Financiar la expansión de la planta de la empresa en la región.',
      fields: [
        { label: 'Modalidad', value: 'Venta parcial' },
        { label: 'Tamaño de la transacción', value: 'COP 5.000 M – 20.000 M' },
        { label: 'Horizonte', value: '6 a 12 meses' },
      ],
    });
    expect(sections.BUSINESS?.fields).toEqual([
      { label: 'Subsector', value: 'Cafés especiales (la región)' },
      { label: 'Tamaño de la empresa', value: '51 - 200 empleados' },
      { label: 'Trayectoria', value: 'Más de 15 años' },
    ]);
    // CAGR 2021→2025: (12000/8200)^(1/4) − 1 ≈ 9.99 % → 10 %
    expect(sections.REVENUE).toEqual({
      title: 'Cifras de ingresos',
      text: null,
      fields: [
        { label: 'Ingresos del último año', value: 'COP 5.000 M – 20.000 M' },
        { label: 'Crecimiento anual compuesto', value: '+10 %' },
      ],
    });
    expect(sections.OPERATIONS?.fields).toEqual([
      { label: 'Tamaño del equipo', value: '51 - 200 empleados' },
      { label: 'Canales de venta', value: 'Supermercados de la región, Exportación' },
      { label: 'Capacidad', value: 'Planta de 40 toneladas/mes' },
    ]);
  });

  it('omits every section with inTeaser=false (and sections without a row)', () => {
    const t = toTeaser(
      source({
        visibility: [
          { section: 'SUMMARY', inTeaser: false },
          { section: 'REVENUE', inTeaser: true },
          { section: 'BUSINESS', inTeaser: false },
        ],
      }),
      NOW,
    );
    expect(Object.keys(t.sections)).toEqual(['REVENUE']);
    const json = JSON.stringify(t);
    expect(json).not.toContain('tostadora');
    expect(json).not.toContain('Financiar');
    expect(json).not.toContain('Supermercados');
  });

  it('returns no sections when nothing is visible', () => {
    expect(toTeaser(source({ visibility: [] }), NOW).sections).toEqual({});
  });

  it('trims fields that have no data and drops empty sections', () => {
    const t = toTeaser(
      source({
        dealSizeMin: null,
        dealSizeMax: null,
        horizon: null,
        subsector: null,
        employeesRange: null,
        foundedYear: null,
        channels: undefined,
        capacity: null,
        financials: [],
        description: '',
      }),
      NOW,
    );
    expect(t.sections.SUMMARY?.fields).toEqual([{ label: 'Modalidad', value: 'Venta parcial' }]);
    expect(t.sections.BUSINESS).toBeUndefined();
    expect(t.sections.REVENUE).toBeUndefined();
    expect(t.sections.OPERATIONS).toBeUndefined();
  });

  it('shows the founding age in coarse buckets', () => {
    const age = (foundedYear: number) =>
      toTeaser(source({ foundedYear }), NOW).sections.BUSINESS?.fields.find(
        (f) => f.label === 'Trayectoria',
      )?.value;
    expect(age(2026)).toBe('Hasta 5 años');
    expect(age(2021)).toBe('Hasta 5 años');
    expect(age(2020)).toBe('Más de 5 años');
    expect(age(2011)).toBe('Más de 10 años');
    expect(age(1990)).toBe('Más de 35 años');
  });

  it('uses the current date by default', () => {
    expect(toTeaser(source()).sections.BUSINESS?.fields.at(-1)?.value).toMatch(/^Más de \d+ años$/);
  });
});

describe('toTeaser — REVENUE', () => {
  const revenue = (financials: TeaserSource['financials']) =>
    toTeaser(source({ financials, visibility: [{ section: 'REVENUE', inTeaser: true }] }), NOW)
      .sections.REVENUE?.fields;

  it('shows only the bucket when a single year is available', () => {
    expect(revenue([{ year: 2025, revenue: millions(60000) }])).toEqual([
      { label: 'Ingresos del último año', value: 'Más de COP 50.000 M' },
    ]);
  });

  it('shows negative and zero growth', () => {
    expect(
      revenue([
        { year: 2024, revenue: millions(10000) },
        { year: 2025, revenue: millions(9000) },
      ])?.[1],
    ).toEqual({ label: 'Crecimiento anual compuesto', value: '-10 %' });
    expect(
      revenue([
        { year: 2024, revenue: millions(10000) },
        { year: 2025, revenue: millions(10010) },
      ])?.[1]?.value,
    ).toBe('0 %');
  });

  it('skips growth when the first year has no revenue', () => {
    expect(
      revenue([
        { year: 2024, revenue: 0n },
        { year: 2025, revenue: millions(3000) },
      ]),
    ).toEqual([{ label: 'Ingresos del último año', value: 'Menos de COP 5.000 M' }]);
  });
});

describe('revenueBucket', () => {
  it.each([
    [0, 'Menos de COP 5.000 M'],
    [4999, 'Menos de COP 5.000 M'],
    [5000, 'COP 5.000 M – 20.000 M'],
    [19999, 'COP 5.000 M – 20.000 M'],
    [20000, 'COP 20.000 M – 50.000 M'],
    [49999, 'COP 20.000 M – 50.000 M'],
    [50000, 'Más de COP 50.000 M'],
    [900000, 'Más de COP 50.000 M'],
  ])('%i M → %s', (m, label) => {
    expect(revenueBucket(millions(m))).toBe(label);
  });
});

describe('toTeaser — evaluation', () => {
  it('formats the valuation range with the mandatory disclaimer (R3)', () => {
    const t = toTeaser(
      source({
        evaluation: { valuationLow: millions(13900), valuationHigh: millions(20800), score: 78 },
      }),
      NOW,
    );
    expect(t.evaluation).toEqual({
      valuationLow: 'COP 13.900 M',
      valuationHigh: 'COP 20.800 M',
      score: 78,
      disclaimer: VALUATION_DISCLAIMER,
    });
  });
});

describe('scrubIdentity', () => {
  const id = { legalName: 'Logística Caribe Ltda.', nit: '900.102.002-2', city: 'Cali' };

  it('keeps words that only contain the city as a substring', () => {
    expect(scrubIdentity('Calidad y servicio en Cali y California.', id)).toBe(
      'Calidad y servicio en la región y California.',
    );
  });

  it('removes NIT in its usual spellings', () => {
    expect(scrubIdentity('NIT: 900 102 002 - 2. Otro: 900102002', id)).toBe('. Otro:');
  });

  it('removes short corporate names only when long enough', () => {
    expect(scrubIdentity('XY S.A.S. vende', { legalName: 'XY S.A.S.', nit: '', city: '' })).toBe(
      'la empresa vende',
    );
    expect(scrubIdentity('Ab compra', { legalName: 'Ab', nit: '', city: '' })).toBe('Ab compra');
  });

  it('removes money amounts', () => {
    expect(scrubIdentity('Vende $ 3.500 millones y USD 2M al año', id)).toBe(
      'Vende cifra reservada y cifra reservada al año',
    );
  });
});
