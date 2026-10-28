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

import { registerAction } from '@/app/(auth)/registro/actions';
import { DEFAULT_KYC_CHECKLIST } from '@/domain/onboarding';
import { ValidationError } from '@/domain/errors';
import { resetRegisterLimiter } from '@/server/auth/rate-limit';
import { SESSION_COOKIE, hashToken } from '@/server/auth/session';
import { db } from '@/server/db';
import { DUPLICATE_EMAIL_ERROR, registerUser } from './registration';

const tag = randomUUID().slice(0, 8);
const emailFor = (label: string) => `registro-${label}-${tag}@demo.ladorada.co`;
const PASSWORD = 'Montana2026dorada';
const CTX = { ip: '198.51.100.7', userAgent: 'vitest' };
const GENERIC_DUPLICATE =
  'No pudimos crear la cuenta con esos datos. Si ya tienes una, inicia sesión.';

type Fields = Partial<Record<'role' | 'name' | 'email' | 'password' | 'consent', string>>;

const form = (overrides: Fields = {}) => {
  const values: Fields = {
    role: 'SELLER',
    name: 'Valentina Ríos',
    email: emailFor(randomUUID().slice(0, 6)),
    password: PASSWORD,
    consent: 'on',
    ...overrides,
  };
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) if (v !== undefined) f.set(k, v);
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

const ourUsers = () =>
  db.user.findMany({ where: { email: { contains: tag } }, select: { id: true } });
const userCount = () => db.user.count({ where: { email: { contains: tag } } });

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
});

beforeEach(() => {
  resetRegisterLimiter();
  cookieJar.clear();
  mocks.requestHeaders = { 'x-real-ip': '203.0.113.10' };
});

afterAll(async () => {
  const ids = (await ourUsers()).map((u) => u.id);
  const cases = await db.verificationCase.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });
  const caseIds = cases.map((c) => c.id);
  // Children first: FKs to User / VerificationCase are Restrict.
  await db.kycChecklistItem.deleteMany({ where: { verificationCaseId: { in: caseIds } } });
  await db.verificationDocument.deleteMany({ where: { verificationCaseId: { in: caseIds } } });
  await db.verificationCase.deleteMany({ where: { id: { in: caseIds } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe('registerUser', () => {
  it('creates a PENDING user with consent, an OPEN case at step 1 with the KYC checklist, a session and a USER_REGISTERED audit without the email', async () => {
    const email = emailFor('ok');
    const before = Date.now();
    const out = await registerUser(
      { role: 'BUYER', name: 'Andrés Gómez', email, password: PASSWORD, consent: true },
      CTX,
    );

    const user = await db.user.findUniqueOrThrow({ where: { id: out.userId } });
    expect(user).toMatchObject({ email, name: 'Andrés Gómez', role: 'BUYER', status: 'PENDING' });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.consentAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);

    const cases = await db.verificationCase.findMany({
      where: { userId: out.userId },
      include: { checklist: true },
    });
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ status: 'OPEN', step: 1 });
    expect(cases[0]?.checklist.map((i) => i.label).sort()).toEqual(
      [...DEFAULT_KYC_CHECKLIST].sort(),
    );
    expect(cases[0]?.checklist).toHaveLength(4);
    expect(cases[0]?.checklist.every((i) => !i.done)).toBe(true);

    const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: hashToken(out.token) },
    });
    expect(session).toMatchObject({ userId: out.userId, ip: CTX.ip, userAgent: CTX.userAgent });
    expect(out.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const audits = await db.auditLog.findMany({
      where: { action: 'USER_REGISTERED', entity: 'User', entityId: out.userId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: out.userId, ip: CTX.ip, after: { role: 'BUYER' } });
    const a = audits[0];
    const serialized = JSON.stringify([a?.before, a?.after, a?.entityId, a?.actorId]).toLowerCase();
    expect(serialized).not.toContain(email);
    expect(serialized).not.toContain(PASSWORD.toLowerCase());
    expect(serialized).not.toContain('andrés');
  });

  it('normalizes the email (trim + lowercase)', async () => {
    const email = emailFor('mixed');
    const out = await registerUser(
      {
        role: 'SELLER',
        name: 'Laura Peña',
        email: `  ${email.toUpperCase()}  `,
        password: PASSWORD,
        consent: true,
      },
      CTX,
    );
    const user = await db.user.findUniqueOrThrow({ where: { id: out.userId } });
    expect(user.email).toBe(email);
  });

  it('rejects an existing email (any case) with the generic message and creates nothing', async () => {
    const email = emailFor('dup');
    await registerUser(
      { role: 'BUYER', name: 'Primera Cuenta', email, password: PASSWORD, consent: true },
      CTX,
    );
    const users = await userCount();
    const cases = await db.verificationCase.count();
    const audits = await db.auditLog.count({ where: { action: 'USER_REGISTERED' } });

    const attempt = registerUser(
      {
        role: 'SELLER',
        name: 'Segunda Cuenta',
        email: email.toUpperCase(),
        password: PASSWORD,
        consent: true,
      },
      CTX,
    );
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toThrow(GENERIC_DUPLICATE);
    expect(DUPLICATE_EMAIL_ERROR).toBe(GENERIC_DUPLICATE);

    expect(await userCount()).toBe(users);
    expect(await db.verificationCase.count()).toBe(cases);
    expect(await db.auditLog.count({ where: { action: 'USER_REGISTERED' } })).toBe(audits);
  });

  it('lets only one of two concurrent sign-ups with the same email succeed', async () => {
    const email = emailFor('race');
    const input = {
      role: 'BUYER' as const,
      name: 'Cuenta Carrera',
      email,
      password: PASSWORD,
      consent: true as const,
    };
    const results = await Promise.allSettled([registerUser(input, CTX), registerUser(input, CTX)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);
    expect(await db.user.count({ where: { email } })).toBe(1);
  });

  it('re-validates its input (defense in depth): no consent or a weak password is rejected', async () => {
    const base = {
      role: 'BUYER' as const,
      name: 'Sin Validar',
      email: emailFor('raw'),
      password: PASSWORD,
    };
    await expect(
      registerUser(
        { ...base, consent: false } as unknown as Parameters<typeof registerUser>[0],
        CTX,
      ),
    ).rejects.toThrow();
    await expect(
      registerUser({ ...base, password: 'corta1', consent: true }, CTX),
    ).rejects.toThrow();
    expect(await db.user.count({ where: { email: base.email } })).toBe(0);
  });
});

describe('registerAction', () => {
  it('signs up, sets the session cookie and redirects to /onboarding', async () => {
    const email = emailFor('action');
    const { digest, result } = await run(() => registerAction({}, form({ email, role: 'BUYER' })));

    expect(result).toBeUndefined();
    expect(digest).toContain(';/onboarding;');
    const cookie = cookieJar.get(SESSION_COOKIE);
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: hashToken(cookie?.value ?? '') },
      include: { user: true },
    });
    expect(session.user).toMatchObject({ email, role: 'BUYER', status: 'PENDING' });
    expect(session.ip).toBe('203.0.113.10');
  });

  it('returns the generic error for an existing email and keeps the user count', async () => {
    const email = emailFor('action-dup');
    await run(() => registerAction({}, form({ email })));
    cookieJar.clear();
    const users = await userCount();

    const { result, digest } = await run(() =>
      registerAction({}, form({ email: ` ${email.toUpperCase()}` })),
    );

    expect(digest).toBeUndefined();
    expect(result).toMatchObject({ error: GENERIC_DUPLICATE });
    expect(cookieJar.size).toBe(0);
    expect(await userCount()).toBe(users);
  });

  it('requires the Habeas Data consent', async () => {
    const email = emailFor('noconsent');
    const { result } = await run(() => registerAction({}, form({ email, consent: undefined })));

    expect(result).toMatchObject({
      fieldErrors: { consent: expect.stringContaining('autorizar el tratamiento') },
    });
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it.each([
    ['too short', 'abc12345'],
    ['no digit', 'soloLetrasLargas'],
    ['no letter', '12345678901'],
    ['too long', `a1${'x'.repeat(127)}`],
  ])('rejects a weak password (%s)', async (_label, password) => {
    const email = emailFor(`weak-${_label.replace(/\s/g, '')}`);
    const { result } = await run(() => registerAction({}, form({ email, password })));

    expect(result).toMatchObject({
      fieldErrors: { password: expect.stringContaining('entre 10 y 128 caracteres') },
    });
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it('rejects an unknown role (no self-service BACKOFFICE)', async () => {
    const email = emailFor('bo');
    const { result } = await run(() => registerAction({}, form({ email, role: 'BACKOFFICE' })));
    expect(result).toMatchObject({ fieldErrors: { role: expect.any(String) } });
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it('keeps the typed name, email and role (never the password) after a validation error', async () => {
    const email = emailFor('keep');
    const { result } = await run(() =>
      registerAction({}, form({ email, role: 'BUYER', password: 'corta' })),
    );
    expect(result).toMatchObject({ values: { email, role: 'BUYER', name: 'Valentina Ríos' } });
    expect((result as { values: object }).values).not.toHaveProperty('password');
    expect(JSON.stringify(result)).not.toContain('"corta"');
  });

  it('blocks the 6th sign-up from the same IP within 15 minutes', async () => {
    for (let i = 0; i < 5; i++) {
      const { digest } = await run(() =>
        registerAction({}, form({ email: emailFor(`burst${i}`) })),
      );
      expect(digest).toContain(';/onboarding;');
    }
    const email = emailFor('burst5');
    const { result, digest } = await run(() => registerAction({}, form({ email })));

    expect(digest).toBeUndefined();
    expect(result).toMatchObject({ error: expect.stringContaining('Demasiados intentos') });
    expect(await db.user.count({ where: { email } })).toBe(0);

    // Another IP is not affected.
    mocks.requestHeaders = { 'x-real-ip': '203.0.113.99' };
    const other = await run(() => registerAction({}, form({ email })));
    expect(other.digest).toContain(';/onboarding;');
  });

  it('never writes an email into a USER_REGISTERED audit row', async () => {
    const rows = await db.auditLog.findMany({ where: { action: 'USER_REGISTERED' } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const serialized = JSON.stringify([row.before, row.after, row.entityId]).toLowerCase();
      expect(serialized).not.toContain('@');
    }
  });
});
