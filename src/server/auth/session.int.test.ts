import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { createSession, invalidateUserSessions, validateSession } from './session';

const tag = randomUUID().slice(0, 8);
let userId = '';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/test/i);

  const user = await db.user.create({
    data: {
      email: `session-${tag}@demo.ladorada.co`,
      passwordHash: 'x',
      name: 'Usuario Sesión',
      role: 'BUYER',
      status: 'ENABLED',
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await db.session.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe('sessions', () => {
  it('stores only sha256(token), never the token itself', async () => {
    const { token, expiresAt } = await createSession(userId);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const row = await db.session.findUniqueOrThrow({ where: { tokenHash: sha256(token) } });
    expect(row.tokenHash).toBe(sha256(token));
    for (const value of Object.values(row)) {
      expect(String(value)).not.toContain(token);
    }
  });

  it('validateSession returns the user for a valid token', async () => {
    const { token } = await createSession(userId);
    const result = await validateSession(token);
    expect(result?.user).toEqual({
      id: userId,
      email: `session-${tag}@demo.ladorada.co`,
      name: 'Usuario Sesión',
      role: 'BUYER',
      status: 'ENABLED',
    });
    expect(result?.sessionId).toEqual(expect.any(String));
  });

  it('returns null for a tampered token', async () => {
    const { token } = await createSession(userId);
    const tampered = (token[0] === 'A' ? 'B' : 'A') + token.slice(1);
    expect(await validateSession(tampered)).toBeNull();
  });

  it('returns null for an expired session', async () => {
    const { token } = await createSession(userId);
    await db.session.update({
      where: { tokenHash: sha256(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await validateSession(token)).toBeNull();
  });

  it('slides the expiration when less than 3.5 days remain', async () => {
    const { token } = await createSession(userId);
    const soon = new Date(Date.now() + 86_400_000);
    await db.session.update({ where: { tokenHash: sha256(token) }, data: { expiresAt: soon } });

    expect(await validateSession(token)).not.toBeNull();
    const row = await db.session.findUniqueOrThrow({ where: { tokenHash: sha256(token) } });
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  });

  it('returns null after invalidateUserSessions', async () => {
    const { token } = await createSession(userId);
    expect(await validateSession(token)).not.toBeNull();
    await invalidateUserSessions(userId);
    expect(await validateSession(token)).toBeNull();
  });
});
