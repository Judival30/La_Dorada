import { describe, expect, it } from 'vitest';
import { toDTO } from '@/server/dto';

describe('toDTO', () => {
  it('converts bigint to string and Date to ISO string', () => {
    expect(JSON.stringify(toDTO({ a: 5n, d: new Date('2026-01-02T00:00:00Z') }))).toBe(
      '{"a":"5","d":"2026-01-02T00:00:00.000Z"}',
    );
  });

  it('recurses through nested objects and arrays', () => {
    const input = { items: [{ price: 10n, at: new Date(0) }], meta: { total: 1n } };
    expect(toDTO(input)).toEqual({
      items: [{ price: '10', at: '1970-01-01T00:00:00.000Z' }],
      meta: { total: '1' },
    });
  });

  it('leaves other primitives unchanged', () => {
    expect(toDTO({ s: 'x', n: 1, b: true, z: null, u: undefined })).toEqual({
      s: 'x',
      n: 1,
      b: true,
      z: null,
      u: undefined,
    });
    expect(toDTO(42)).toBe(42);
    expect(toDTO('plain')).toBe('plain');
  });

  it('does not mutate the input', () => {
    const input = { a: 1n };
    toDTO(input);
    expect(input).toEqual({ a: 1n });
  });
});
