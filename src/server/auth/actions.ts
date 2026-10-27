'use server';

import { randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { writeAudit } from '@/server/audit/audit';
import { db } from '@/server/db';
import { homePathFor } from './guard';
import { hashPassword, verifyPassword } from './password';
import { loginLimiter } from './rate-limit';
import {
  SESSION_COOKIE,
  createSession,
  deleteSessionCookie,
  invalidateSession,
  setSessionCookie,
  validateSession,
} from './session';

export type LoginState = { error?: string };

const GENERIC_ERROR = 'Correo o contraseña incorrectos.';
const RATE_LIMITED_ERROR = 'Demasiados intentos. Intenta de nuevo en un minuto.';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(256),
  next: z.string().optional(),
});

/** Hash checked when the email is unknown, so both failure paths cost the same. */
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')));

async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || '127.0.0.1';
}

/** Only same-origin absolute paths are accepted as post-login destinations. */
function safeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return null;
  }
  return next;
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: form.get('email'),
    password: form.get('password'),
    next: form.get('next') ?? undefined,
  });
  if (!parsed.success) return { error: GENERIC_ERROR };
  const { email, password, next } = parsed.data;

  const ip = await clientIp();
  // Counted before the password check, successful attempts included.
  if (!loginLimiter.take(`${ip}:${email}`)) return { error: RATE_LIMITED_ERROR };

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true, passwordHash: true },
  });
  const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);

  if (!user || !ok) {
    await db.$transaction((tx) =>
      writeAudit(tx, {
        actorId: user?.id ?? null,
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: user?.id ?? 'unknown',
        after: { email, reason: user ? 'BAD_PASSWORD' : 'UNKNOWN_EMAIL' },
        ip,
      }),
    );
    return { error: GENERIC_ERROR };
  }

  const userAgent = (await headers()).get('user-agent');
  const { token, expiresAt } = await db.$transaction(async (tx) => {
    const session = await createSession(user.id, { tx, ip, userAgent });
    await writeAudit(tx, {
      actorId: user.id,
      action: 'LOGIN_SUCCEEDED',
      entity: 'User',
      entityId: user.id,
      ip,
    });
    return session;
  });
  await setSessionCookie(token, expiresAt);

  // Outside any try/catch: redirect() works by throwing NEXT_REDIRECT.
  redirect(safeNext(next) ?? homePathFor(user.role));
}

export async function logoutAction(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await validateSession(token);
    if (session) await invalidateSession(session.sessionId);
  }
  await deleteSessionCookie();
  redirect('/login');
}
