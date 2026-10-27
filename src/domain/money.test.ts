import { describe, expect, it } from 'vitest';
import { formatCOP, millions } from '@/domain/money';

describe('formatCOP', () => {
  it('formats whole millions with . thousands separator', () => {
    expect(formatCOP(millions(12000))).toBe('COP 12.000 M');
    expect(formatCOP(millions(2100))).toBe('COP 2.100 M');
    expect(formatCOP(millions(180000))).toBe('COP 180.000 M');
  });

  it('shows full pesos below one million', () => {
    expect(formatCOP(850_000n)).toBe('COP 850.000');
    expect(formatCOP(999_999n)).toBe('COP 999.999');
    expect(formatCOP(0n)).toBe('COP 0');
  });

  it('rounds to the nearest million, half away from zero', () => {
    expect(formatCOP(1_000_000n)).toBe('COP 1 M');
    expect(formatCOP(1_499_999n)).toBe('COP 1 M');
    expect(formatCOP(1_500_000n)).toBe('COP 2 M');
    expect(formatCOP(2_500_000n)).toBe('COP 3 M');
    expect(formatCOP(-2_500_000n)).toBe('-COP 3 M');
  });

  it('prefixes negative values with - before COP', () => {
    expect(formatCOP(millions(-200))).toBe('-COP 200 M');
    expect(formatCOP(-850_000n)).toBe('-COP 850.000');
  });

  it('handles large values without precision loss', () => {
    expect(formatCOP(123_456_789_012_345_678n)).toBe('COP 123.456.789.012 M');
  });
});

describe('millions', () => {
  it('converts millions to pesos as bigint', () => {
    expect(millions(12000)).toBe(12_000_000_000n);
    expect(millions(0.5)).toBe(500_000n);
  });

  it('throws RangeError for non-finite input', () => {
    expect(() => millions(Number.NaN)).toThrow(RangeError);
    expect(() => millions(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => millions(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });
});
