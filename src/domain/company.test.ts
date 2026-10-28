import { describe, expect, it } from 'vitest';
import {
  COMPANY_SCHEMAS,
  EMPLOYEE_RANGES,
  FINANCIAL_YEARS_SCHEMA,
  NIT_SCHEMA,
  financialYearsIssue,
  formatNit,
  isValidNit,
  nitCheckDigit,
} from './company';

const CURRENT_YEAR = new Date().getFullYear();

describe('nitCheckDigit (DIAN)', () => {
  it('computes 900123456 → 8', () => {
    // Digits right to left: 6 5 4 3 2 1 0 0 9, weights 3 7 13 17 19 23 29 37 41
    // 6·3 + 5·7 + 4·13 + 3·17 + 2·19 + 1·23 + 0·29 + 0·37 + 9·41
    // = 18 + 35 + 52 + 51 + 38 + 23 + 0 + 0 + 369 = 586; 586 mod 11 = 3 → 11 − 3 = 8
    expect(nitCheckDigit('900123456')).toBe(8);
  });

  it('computes 800197268 → 4 (public NIT of the DIAN itself)', () => {
    // Digits right to left: 8 6 2 7 9 1 0 0 8
    // 8·3 + 6·7 + 2·13 + 7·17 + 9·19 + 1·23 + 0·29 + 0·37 + 8·41
    // = 24 + 42 + 26 + 119 + 171 + 23 + 0 + 0 + 328 = 733; 733 mod 11 = 7 → 11 − 7 = 4
    expect(nitCheckDigit('800197268')).toBe(4);
  });

  it('returns the remainder itself when it is 0 or 1', () => {
    // 900100005: 5·3 + 1·23 + 9·41 = 15 + 23 + 369 = 407 = 11·37 → remainder 0 → 0
    expect(nitCheckDigit('900100005')).toBe(0);
    // 900100009: 9·3 + 1·23 + 9·41 = 27 + 23 + 369 = 419 = 11·38 + 1 → remainder 1 → 1
    expect(nitCheckDigit('900100009')).toBe(1);
  });

  it('accepts dotted bases and short bases', () => {
    expect(nitCheckDigit('900.123.456')).toBe(8);
    // 1·3 = 3 → 11 − 3 = 8
    expect(nitCheckDigit('1')).toBe(8);
  });

  it('rejects non-digit or oversized bases', () => {
    expect(() => nitCheckDigit('90012345a')).toThrow(RangeError);
    expect(() => nitCheckDigit('')).toThrow(RangeError);
    expect(() => nitCheckDigit('1234567890123456')).toThrow(RangeError);
  });
});

describe('isValidNit / formatNit', () => {
  it('accepts well-formed NITs with the right check digit', () => {
    expect(isValidNit('900.123.456-8')).toBe(true);
    expect(isValidNit('800.197.268-4')).toBe(true);
    expect(isValidNit(` ${formatNit('900100005')} `)).toBe(true);
  });

  it('rejects a wrong check digit (900.123.456-? only accepts the computed one)', () => {
    for (let d = 0; d <= 9; d++) {
      expect(isValidNit(`900.123.456-${d}`)).toBe(d === 8);
    }
  });

  it('rejects malformed NITs', () => {
    expect(isValidNit('9001234568')).toBe(false);
    expect(isValidNit('900.123.456')).toBe(false);
    expect(isValidNit('900-123-456-8')).toBe(false);
    expect(isValidNit('')).toBe(false);
  });

  it('formats a 9-digit base with its check digit', () => {
    expect(formatNit('900123456')).toBe('900.123.456-8');
    expect(formatNit('800197268')).toBe('800.197.268-4');
    expect(() => formatNit('90012345')).toThrow(RangeError);
  });

  it('NIT_SCHEMA explains the error in es-CO', () => {
    expect(NIT_SCHEMA.safeParse('900.123.456-8').success).toBe(true);
    const bad = NIT_SCHEMA.safeParse('900.123.456-7');
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toMatch(/dígito de verificación/);
    expect(NIT_SCHEMA.safeParse('9001').error?.issues[0]?.message).toMatch(/formato/);
  });
});

describe('COMPANY_SCHEMAS', () => {
  const general = {
    name: 'Cafés de Antioquia',
    description: 'Productor y comercializador de cafés especiales con presencia nacional.',
    foundedYear: '2015',
    employeesRange: '11 - 50',
  };

  it('general: accepts slide08 data and coerces the year', () => {
    const r = COMPANY_SCHEMAS.general.parse(general);
    expect(r.foundedYear).toBe(2015);
    expect(EMPLOYEE_RANGES).toContain(r.employeesRange);
  });

  it('general: description must be 40–600 characters', () => {
    expect(COMPANY_SCHEMAS.general.safeParse({ ...general, description: 'Corta' }).success).toBe(
      false,
    );
    expect(
      COMPANY_SCHEMAS.general.safeParse({ ...general, description: 'x'.repeat(601) }).success,
    ).toBe(false);
  });

  it('general: founded year between 1900 and the current year', () => {
    expect(COMPANY_SCHEMAS.general.safeParse({ ...general, foundedYear: 1899 }).success).toBe(
      false,
    );
    expect(
      COMPANY_SCHEMAS.general.safeParse({ ...general, foundedYear: CURRENT_YEAR + 1 }).success,
    ).toBe(false);
    expect(
      COMPANY_SCHEMAS.general.safeParse({ ...general, foundedYear: CURRENT_YEAR }).success,
    ).toBe(true);
  });

  it('general: employees range must be one of the listed ranges', () => {
    expect(COMPANY_SCHEMAS.general.safeParse({ ...general, employeesRange: '12' }).success).toBe(
      false,
    );
  });

  it('sector: sector enum, subsector and at most 5 unique tags', () => {
    const ok = {
      sector: 'ALIMENTOS_BEBIDAS',
      subsector: 'Cafés especiales',
      tags: ['Café especial', 'Exportación'],
    };
    expect(COMPANY_SCHEMAS.sector.parse(ok).tags).toEqual(['Café especial', 'Exportación']);
    expect(COMPANY_SCHEMAS.sector.parse({ ...ok, tags: undefined }).tags).toEqual([]);
    expect(COMPANY_SCHEMAS.sector.safeParse({ ...ok, sector: 'MINERIA' }).success).toBe(false);
    expect(
      COMPANY_SCHEMAS.sector.safeParse({ ...ok, tags: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'] })
        .success,
    ).toBe(false);
    expect(COMPANY_SCHEMAS.sector.safeParse({ ...ok, tags: ['Café', 'café'] }).success).toBe(false);
  });

  it('operations: channels and optional capacity', () => {
    expect(
      COMPANY_SCHEMAS.operations.parse({
        channels: ['Nacional e internacional'],
        capacity: 'Alta',
      }),
    ).toEqual({ channels: ['Nacional e internacional'], capacity: 'Alta' });
    expect(COMPANY_SCHEMAS.operations.parse({ channels: [] })).toEqual({ channels: [] });
    expect(
      COMPANY_SCHEMAS.operations.safeParse({
        channels: Array.from({ length: 9 }, (_, i) => `c${i}`),
      }).success,
    ).toBe(false);
  });

  it('location: department from the list, city and optional address', () => {
    const ok = { department: 'Antioquia', city: 'Medellín' };
    expect(COMPANY_SCHEMAS.location.parse(ok)).toEqual(ok);
    expect(COMPANY_SCHEMAS.location.parse({ ...ok, address: 'Calle 123 # 45-67' }).address).toBe(
      'Calle 123 # 45-67',
    );
    expect(COMPANY_SCHEMAS.location.safeParse({ ...ok, department: 'Texas' }).success).toBe(false);
    expect(COMPANY_SCHEMAS.location.safeParse({ ...ok, city: '' }).success).toBe(false);
  });
});

describe('FINANCIAL_YEARS_SCHEMA', () => {
  const years = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      year: from + i,
      revenue: 10_000 + i * 1000,
      ebitda: 1500,
      netIncome: 800,
    }));

  it('accepts 3 to 5 consecutive years ending last year or this year, sorted', () => {
    const last3 = years(CURRENT_YEAR - 3, 3);
    expect(FINANCIAL_YEARS_SCHEMA.parse([...last3].reverse()).map((y) => y.year)).toEqual([
      CURRENT_YEAR - 3,
      CURRENT_YEAR - 2,
      CURRENT_YEAR - 1,
    ]);
    expect(FINANCIAL_YEARS_SCHEMA.safeParse(years(CURRENT_YEAR - 4, 5)).success).toBe(true);
  });

  it('rejects fewer than 3 or more than 5 years', () => {
    expect(FINANCIAL_YEARS_SCHEMA.safeParse(years(CURRENT_YEAR - 2, 2)).success).toBe(false);
    expect(FINANCIAL_YEARS_SCHEMA.safeParse(years(CURRENT_YEAR - 6, 6)).success).toBe(false);
  });

  it('rejects non-consecutive and duplicated years', () => {
    const gap = years(CURRENT_YEAR - 3, 3);
    gap[0]!.year = CURRENT_YEAR - 5;
    const r = FINANCIAL_YEARS_SCHEMA.safeParse(gap);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/consecutivos/);

    const dup = years(CURRENT_YEAR - 3, 3);
    dup[1]!.year = dup[2]!.year;
    expect(FINANCIAL_YEARS_SCHEMA.safeParse(dup).success).toBe(false);
  });

  it('rejects series that end too long ago', () => {
    const r = FINANCIAL_YEARS_SCHEMA.safeParse(years(CURRENT_YEAR - 6, 3));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(new RegExp(String(CURRENT_YEAR - 1)));
  });

  it('allows negative ebitda/netIncome but not negative revenue or decimals', () => {
    const neg = years(CURRENT_YEAR - 3, 3).map((y) => ({ ...y, ebitda: -200, netIncome: -50 }));
    expect(FINANCIAL_YEARS_SCHEMA.safeParse(neg).success).toBe(true);
    const badRevenue = years(CURRENT_YEAR - 3, 3);
    badRevenue[0]!.revenue = -1;
    expect(FINANCIAL_YEARS_SCHEMA.safeParse(badRevenue).success).toBe(false);
    const decimal = years(CURRENT_YEAR - 3, 3);
    decimal[0]!.revenue = 10.5;
    expect(FINANCIAL_YEARS_SCHEMA.safeParse(decimal).success).toBe(false);
  });

  it('financialYearsIssue reports in es-CO and is null when valid', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    expect(financialYearsIssue([], now)).toMatch(/al menos 3 años/);
    expect(financialYearsIssue([{ year: 2023 }, { year: 2024 }, { year: 2025 }], now)).toBeNull();
    expect(financialYearsIssue([{ year: 2024 }, { year: 2025 }, { year: 2026 }], now)).toBeNull();
    expect(financialYearsIssue([{ year: 2022 }, { year: 2023 }, { year: 2024 }], now)).toMatch(
      /2025/,
    );
  });
});
