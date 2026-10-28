import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { cookies } from 'next/headers';
import type { UserStatus } from '@/domain/machines/user';
import type { Role } from '@/domain/roles';
import { db } from '@/server/db';
import { env } from '@/server/env';
import { SESSION_COOKIE, sessionCookieOptions } from './cookie';

export { SESSION_COOKIE };

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
};

const DAY_MS = 86_400_000;
/** Below this remaining lifetime, `validateSession` slides the expiration. */
const SLIDE_THRESHOLD_MS = 3.5 * DAY_MS;

const ttlMs = () => env.SESSION_TTL_DAYS * DAY_MS;

/** sha256(token) as hex: the only form of the token that is ever stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type CreateSessionOptions = {
  /** Run inside the caller's transaction (e.g. together with the login audit). */
  tx?: Prisma.TransactionClient;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Creates a session with a fresh 32-byte random token (base64url). Only
 * `sha256(token)` is persisted; the raw token is returned once, for the cookie.
 */
export async function createSession(
  userId: string,
  opts: CreateSessionOptions = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs());
  await (opts.tx ?? db).session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    },
  });
  return { token, expiresAt };
}

export type ValidatedSession = {
  user: SessionUser;
  sessionId: string;
  expiresAt: Date;
  /** True when this call slid the expiration forward. */
  extended: boolean;
};

/**
 * Resolves a token to its user. Unknown or expired tokens yield `null` (an
 * expired row is deleted). When fewer than 3.5 days remain, the expiration is
 * extended to now + SESSION_TTL_DAYS and `extended` is true.
 */
export async function validateSessionDetailed(token: string): Promise<ValidatedSession | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, status: true } },
    },
  });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (session.expiresAt.getTime() - now < SLIDE_THRESHOLD_MS) {
    const expiresAt = new Date(now + ttlMs());
    await db.session.update({ where: { id: session.id }, data: { expiresAt } });
    return { user: session.user, sessionId: session.id, expiresAt, extended: true };
  }
  return {
    user: session.user,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    extended: false,
  };
}

/** Brief signature of `validateSessionDetailed`. */
export async function validateSession(
  token: string,
): Promise<{ user: SessionUser; sessionId: string } | null> {
  const s = await validateSessionDetailed(token);
  return s && { user: s.user, sessionId: s.sessionId };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId } });
}

/** Deletes the session a raw token belongs to, if any (logout). Optionally inside `tx`. */
export async function invalidateSessionByToken(
  token: string,
  opts: { tx?: Prisma.TransactionClient } = {},
): Promise<void> {
  await (opts.tx ?? db).session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/**
 * Logs a user out everywhere (e.g. when the user is blocked). Pass `tx` to do it
 * inside the caller's transaction, so it commits or rolls back with the block.
 */
export async function invalidateUserSessions(
  userId: string,
  opts: { tx?: Prisma.TransactionClient } = {},
): Promise<void> {
  await (opts.tx ?? db).session.deleteMany({ where: { userId } });
}

/** Sets the session cookie. Request context only (Server Action / Route Handler). */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
}

/** Deletes the session cookie. Request context only. */
export async function deleteSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
