import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('produces an Argon2id hash that verifies only the original password', async () => {
    const hash = await hashPassword('LaDorada2026!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('LaDorada2026!');
    expect(await verifyPassword(hash, 'LaDorada2026!')).toBe(true);
    expect(await verifyPassword(hash, 'otra-clave')).toBe(false);
  });

  it('returns false instead of throwing for a malformed hash', async () => {
    expect(await verifyPassword('x', 'LaDorada2026!')).toBe(false);
  });
});
