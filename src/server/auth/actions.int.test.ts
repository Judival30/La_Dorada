import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieJar = vi.hoisted(() => new Map<string, string>());

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) as string } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
  headers: async () => new Headers({ 'x-forwarded-for': '127.0.0.1' }),
}));

import { db } from '@/server/db';
import { loginAction, logoutAction } from './actions';
import { homePathFor } from './guard';
import { hashPassword } from './password';
import { resetLoginLimiter } from './rate-limit';
import { SESSION_COOKIE } from './session';

const tag = randomUUID().slice(0, 8);
const email = `login-${tag}@demo.ladorada.co`;
const password = 'LaDorada2026!';
let userId = '';

const form = (e: string, p: string) => {
  const f = new FormData();
  f.set('email', e);
  f.set('password', p);
  return f;
};

/** Runs the action and returns the thrown Next redirect error, if any. */
async function run(fn: () => Promise<unknown>): Promise<{ result?: unknown; digest?: string }> {
  try {
    return { result: await fn() };
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) return { digest };
    throw err;
  }
}

const auditCount = (action: string) =>
  db.auditLog.count({ where: { action, entity: 'User', entityId: userId } });

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/test/i);

  const user = await db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      name: 'Comprador Login',
      role: 'BUYER',
      status: 'ENABLED',
    },
  });
  userId = user.id;
});

beforeEach(() => {
  resetLoginLimiter();
  cookieJar.clear();
});

afterAll(async () => {
  await db.session.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe('loginAction', () => {
  it('redirects to the role home, sets the cookie and audits LOGIN_SUCCEEDED', async () => {
    const before = await auditCount('LOGIN_SUCCEEDED');
    const { digest } = await run(() => loginAction({}, form(email, password)));

    expect(digest).toContain(homePathFor('BUYER'));
    expect(cookieJar.get(SESSION_COOKIE)).toEqual(expect.any(String));
    expect(await auditCount('LOGIN_SUCCEEDED')).toBe(before + 1);

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'LOGIN_SUCCEEDED', entityId: userId },
      orderBy: { seq: 'desc' },
    });
    expect(audit.actorId).toBe(userId);
    const serialized = JSON.stringify([audit.before, audit.after]);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(cookieJar.get(SESSION_COOKIE));
  });

  it('returns the generic error and audits LOGIN_FAILED on a wrong password', async () => {
    const before = await auditCount('LOGIN_FAILED');
    const { result, digest } = await run(() => loginAction({}, form(email, 'incorrecta-123')));

    expect(digest).toBeUndefined();
    expect(result).toEqual({ error: 'Correo o contraseña incorrectos.' });
    expect(cookieJar.size).toBe(0);
    expect(await auditCount('LOGIN_FAILED')).toBe(before + 1);
  });

  it('returns the same generic error for an unknown email', async () => {
    const { result } = await run(() =>
      loginAction({}, form(`nadie-${tag}@demo.ladorada.co`, password)),
    );
    expect(result).toEqual({ error: 'Correo o contraseña incorrectos.' });
  });

  it('rejects the 6th attempt within a minute even with the right password', async () => {
    for (let i = 0; i < 5; i++) {
      await run(() => loginAction({}, form(email, 'incorrecta-123')));
    }
    const { result, digest } = await run(() => loginAction({}, form(email, password)));

    expect(digest).toBeUndefined();
    expect(result).toEqual({ error: 'Demasiados intentos. Intenta de nuevo en un minuto.' });
  });
});

describe('logoutAction', () => {
  it('invalidates the session, deletes the cookie and redirects to /login', async () => {
    await run(() => loginAction({}, form(email, password)));
    const token = cookieJar.get(SESSION_COOKIE);
    expect(token).toBeDefined();
    const sessionsBefore = await db.session.count({ where: { userId } });

    const { digest } = await run(() => logoutAction());

    expect(digest).toContain('/login');
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(await db.session.count({ where: { userId } })).toBe(sessionsBefore - 1);
  });
});
