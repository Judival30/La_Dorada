import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it.each([
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r/evil.com',
    'https://evil.com',
    '/%2F%2Fevil.com',
    'javascript:alert(1)',
    'marketplace',
    '/login',
    '/marketplacex',
    '',
  ])('rejects %j', (next) => {
    expect(safeNext(next)).toBeNull();
  });

  it('rejects missing values', () => {
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  it.each([
    ['/marketplace?x=1', '/marketplace?x=1'],
    ['/marketplace', '/marketplace'],
    ['/seller/opportunities/abc#docs', '/seller/opportunities/abc#docs'],
    ['/bo/../bo/users', '/bo/users'],
  ])('accepts %j as %j', (next, expected) => {
    expect(safeNext(next)).toBe(expected);
  });
});
