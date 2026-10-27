'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audited } from '@/server/audit/audited';
import { db } from '@/server/db';
import { getRequestContext } from '@/server/request-context';
import { homePathFor } from './guard';
import { verifyPassword } from './password';
import { loginEmailLimiter, loginLimiter } from './rate-limit';
import { safeNext } from './safe-next';
import {
  SESSION_COOKIE,
  createSession,
  deleteSessionCookie,
  invalidateSessionByToken,
  setSessionCookie,
} from './session';

export type LoginState = { error?: string };

const GENERIC_ERROR = 'Correo o contraseña incorrectos.';
const RATE_LIMITED_ERROR = 'Demasiados intentos. Intenta de nuevo en un minuto.';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(256),
  next: z.string().optional(),
});

/**
 * Argon2id hash (library default params, m=19456,t=2,p=1) of a throwaway value.
 * Verified when the email is unknown so both failure paths cost the same.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$RtlAaIvBDPaLhdJPtiAfaQ$U0N5LJIkNflsaMnuK686abSmLxqkTPyJ800Kq+HMMqg';

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: form.get('email'),
    password: form.get('password'),
    next: form.get('next') ?? undefined,
  });
  if (!parsed.success) return { error: GENERIC_ERROR };
  const { email, password, next } = parsed.data;

  const { ip, userAgent } = await getRequestContext();
  // Both buckets are checked before the password; successful attempts count too.
  if (!loginLimiter.take(`${ip}:${email}`) || !loginEmailLimiter.take(email)) {
    return { error: RATE_LIMITED_ERROR };
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true, passwordHash: true },
  });
  const ok = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);

  if (!user || !ok) {
    // Data minimization (Ley 1581): the append-only log never stores the typed
    // email. The actor is unauthenticated, so actorId is always null.
    await audited(async () => ({
      result: undefined,
      audit: {
        actorId: null,
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: user?.id ?? 'unknown',
        after: { reason: user ? 'BAD_PASSWORD' : 'UNKNOWN_EMAIL' },
        ip,
      },
    }));
    return { error: GENERIC_ERROR };
  }

  const { token, expiresAt } = await audited(async (tx) => ({
    result: await createSession(user.id, { tx, ip, userAgent }),
    audit: { actorId: user.id, action: 'LOGIN_SUCCEEDED', entity: 'User', entityId: user.id, ip },
  }));
  await setSessionCookie(token, expiresAt);

  // Outside any try/catch: redirect() works by throwing NEXT_REDIRECT.
  redirect(safeNext(next) ?? homePathFor(user.role));
}

export async function logoutAction(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await invalidateSessionByToken(token);
  await deleteSessionCookie();
  redirect('/login');
}
