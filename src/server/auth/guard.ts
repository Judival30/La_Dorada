import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { ForbiddenError, UnauthorizedError } from '@/domain/errors';
import { assertRole } from '@/domain/policies/roles';
import type { Role } from '@/domain/roles';
import { sessionCookieOptions } from './cookie';
import { SESSION_COOKIE, validateSessionDetailed, type SessionUser } from './session';

/** Landing page of each role after login. */
export function homePathFor(role: Role): '/marketplace' | '/seller' | '/bo' {
  switch (role) {
    case 'BUYER':
      return '/marketplace';
    case 'SELLER':
      return '/seller';
    case 'BACKOFFICE':
      return '/bo';
  }
}

/** Next's `ReadonlyRequestCookiesError` (unnamed class) thrown by `cookies().set` in a Server Component. */
function isReadonlyCookiesError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'ReadonlyRequestCookiesError' ||
      err.message.startsWith('Cookies can only be modified in a Server Action or Route Handler'))
  );
}

/**
 * Current user from the `ld_session` cookie, or `null`. Request context only.
 * Memoized with React `cache()`: one session lookup per request, however many
 * layouts, pages and guards ask for it.
 *
 * When the session's expiry slid, the cookie's max-age is re-issued too. That
 * only works in a Server Action or Route Handler; Server Components cannot set
 * cookies, so that one Next error is swallowed (any other error propagates).
 * The middleware also re-issues the cookie on every private-area request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await validateSessionDetailed(token);
  if (!session) return null;
  if (session.extended) {
    const maxAge = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    try {
      store.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
    } catch (err) {
      if (!isReadonlyCookiesError(err)) throw err;
    }
  }
  return session.user;
});

/**
 * Server-side guard for pages and actions:
 * no session → `/login`; status ≠ ENABLED → `/onboarding`; role not allowed → 404.
 */
export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.status !== 'ENABLED') redirect('/onboarding');
  try {
    assertRole(user, ...roles);
  } catch (err) {
    if (err instanceof ForbiddenError) notFound();
    throw err;
  }
  return user;
}

/**
 * Throwing guard for Route Handlers and Server Actions (no redirects):
 * no session → `UnauthorizedError` (401); status ≠ ENABLED or role not allowed →
 * `ForbiddenError` (403). Map the error with `errorResponse` / `toActionError`
 * from `@/server/http/errors`.
 */
export async function requireActor(...roles: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  assertRole(user, ...roles);
  return user;
}
