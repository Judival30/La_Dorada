import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type CookieOptions = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  cookieJar: new Map<string, { value: string; options: Record<string, unknown> }>(),
  requestHeaders: {} as Record<string, string>,
}));
const { cookieJar } = mocks;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const c = mocks.cookieJar.get(name);
      return c ? { name, value: c.value } : undefined;
    },
    set: (name: string, value: string, options: CookieOptions = {}) => {
      mocks.cookieJar.set(name, { value, options });
    },
    delete: (name: string) => {
      mocks.cookieJar.delete(name);
    },
  }),
  headers: async () => new Headers(mocks.requestHeaders),
}));

import { db } from '@/server/db';
import { loginAction, logoutAction } from './actions';
import { homePathFor } from './guard';
import { hashPassword } from './password';
import { resetLoginLimiter } from './rate-limit';
import { SESSION_COOKIE, hashToken } from './session';

const tag = randomUUID().slice(0, 8);
const email = `login-${tag}@demo.ladorada.co`;
const unknownEmail = `nadie-${tag}@demo.ladorada.co`;
const password = 'LaDorada2026!';
const GENERIC = { error: 'Correo o contraseña incorrectos.' };
const TOO_MANY = { error: 'Demasiados intentos. Intenta de nuevo en un minuto.' };
let userId = '';
let testStart = new Date();

const form = (e: string, p: string, next?: string) => {
  const f = new FormData();
  f.set('email', e);
  f.set('password', p);
  if (next !== undefined) f.set('next', next);
  return f;
};

/** Runs the action and returns its result or the thrown Next redirect digest. */
async function run(fn: () => Promise<unknown>): Promise<{ result?: unknown; digest?: string }> {
  try {
    return { result: await fn() };
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) return { digest };
    throw err;
  }
}

const auditCount = (action: string, entityId = userId) =>
  db.auditLog.count({ where: { action, entity: 'User', entityId } });

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  testStart = new Date();

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
  mocks.requestHeaders = { 'x-forwarded-for': '127.0.0.1' };
});

afterAll(async () => {
  await db.session.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe('loginAction', () => {
  it('redirects to the role home, sets a hardened cookie and audits LOGIN_SUCCEEDED', async () => {
    const before = await auditCount('LOGIN_SUCCEEDED');
    const { digest } = await run(() => loginAction({}, form(email, password)));

    expect(digest).toContain(homePathFor('BUYER'));
    const cookie = cookieJar.get(SESSION_COOKIE);
    expect(cookie?.value).toEqual(expect.any(String));
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(cookie?.options.maxAge).toBeGreaterThan(0);
    expect(await auditCount('LOGIN_SUCCEEDED')).toBe(before + 1);

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'LOGIN_SUCCEEDED', entityId: userId },
      orderBy: { seq: 'desc' },
    });
    expect(audit.actorId).toBe(userId);
    const serialized = JSON.stringify([audit.before, audit.after]);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(cookie?.value);
  });

  it('trims and lowercases the email before looking the user up', async () => {
    const { digest } = await run(() =>
      loginAction({}, form(`  ${email.toUpperCase()} `, password)),
    );
    expect(digest).toContain(homePathFor('BUYER'));
  });

  it('honours a safe next path and ignores an unsafe one', async () => {
    const ok = await run(() => loginAction({}, form(email, password, '/marketplace?x=1')));
    expect(ok.digest).toContain(';/marketplace?x=1;');

    const evil = await run(() => loginAction({}, form(email, password, '/\t/evil.com')));
    expect(evil.digest).toContain(`;${homePathFor('BUYER')};`);
    expect(evil.digest).not.toContain('evil');
  });

  it('returns the generic error and audits LOGIN_FAILED with a null actor', async () => {
    const before = await auditCount('LOGIN_FAILED');
    const { result, digest } = await run(() => loginAction({}, form(email, 'incorrecta-123')));

    expect(digest).toBeUndefined();
    expect(result).toEqual(GENERIC);
    expect(cookieJar.size).toBe(0);
    expect(await auditCount('LOGIN_FAILED')).toBe(before + 1);

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'LOGIN_FAILED', entityId: userId },
      orderBy: { seq: 'desc' },
    });
    expect(audit.actorId).toBeNull();
  });

  it('returns the same generic error for an unknown email and audits it as unknown', async () => {
    const before = await auditCount('LOGIN_FAILED', 'unknown');
    const { result } = await run(() => loginAction({}, form(unknownEmail, password)));

    expect(result).toEqual(GENERIC);
    expect(await auditCount('LOGIN_FAILED', 'unknown')).toBe(before + 1);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'LOGIN_FAILED', entityId: 'unknown' },
      orderBy: { seq: 'desc' },
    });
    expect(audit.actorId).toBeNull();
    expect(audit.ip).toBe('127.0.0.1');
  });

  it('rejects the 6th attempt within a minute even with the right password', async () => {
    for (let i = 0; i < 5; i++) {
      await run(() => loginAction({}, form(email, 'incorrecta-123')));
    }
    const { result, digest } = await run(() => loginAction({}, form(email, password)));

    expect(digest).toBeUndefined();
    expect(result).toEqual(TOO_MANY);
  });

  it('is not bypassed by spoofing the first x-forwarded-for entry', async () => {
    for (let i = 0; i < 5; i++) {
      mocks.requestHeaders = { 'x-forwarded-for': `203.0.113.${i}, 10.0.0.1` };
      await run(() => loginAction({}, form(email, 'incorrecta-123')));
    }
    mocks.requestHeaders = { 'x-forwarded-for': '198.51.100.99, 10.0.0.1' };
    const { result } = await run(() => loginAction({}, form(email, password)));
    expect(result).toEqual(TOO_MANY);
  });

  it('blocks the 21st attempt from distinct IPs through the per-email bucket', async () => {
    for (let i = 0; i < 20; i++) {
      mocks.requestHeaders = { 'x-real-ip': `192.0.2.${i}` };
      const { result } = await run(() => loginAction({}, form(email, 'incorrecta-123')));
      expect(result).toEqual(GENERIC);
    }
    mocks.requestHeaders = { 'x-real-ip': '192.0.2.200' };
    const { result, digest } = await run(() => loginAction({}, form(email, password)));
    expect(digest).toBeUndefined();
    expect(result).toEqual(TOO_MANY);
  });

  it('never writes the typed email into any audit row', async () => {
    const rows = await db.auditLog.findMany({
      where: { at: { gte: testStart }, action: { in: ['LOGIN_SUCCEEDED', 'LOGIN_FAILED'] } },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const serialized = JSON.stringify([row.before, row.after, row.entityId]).toLowerCase();
      expect(serialized).not.toContain(email);
      expect(serialized).not.toContain(unknownEmail);
    }
  });
});

describe('logoutAction', () => {
  it('deletes the session row, deletes the cookie and redirects to /login', async () => {
    await run(() => loginAction({}, form(email, password)));
    const token = cookieJar.get(SESSION_COOKIE)?.value;
    expect(token).toBeDefined();
    expect(await db.session.count({ where: { tokenHash: hashToken(token as string) } })).toBe(1);

    const { digest } = await run(() => logoutAction());

    expect(digest).toContain(';/login;');
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(await db.session.count({ where: { tokenHash: hashToken(token as string) } })).toBe(0);
  });

  it('audits LOGOUT with the user as actor (P10)', async () => {
    await run(() => loginAction({}, form(email, password)));
    expect(cookieJar.get(SESSION_COOKIE)?.value).toBeDefined();
    const before = await auditCount('LOGOUT');

    await run(() => logoutAction());

    expect(await auditCount('LOGOUT')).toBe(before + 1);
    const row = await db.auditLog.findFirst({
      where: { action: 'LOGOUT', entityId: userId },
      orderBy: { seq: 'desc' },
    });
    expect(row).toMatchObject({ actorId: userId, entity: 'User', entityId: userId });
  });

  it('without a valid session only clears the cookie (no LOGOUT audit)', async () => {
    cookieJar.set(SESSION_COOKIE, { value: 'token-inexistente', options: {} });
    const before = await auditCount('LOGOUT');
    const { digest } = await run(() => logoutAction());
    expect(digest).toContain(';/login;');
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(await auditCount('LOGOUT')).toBe(before);
  });
});
