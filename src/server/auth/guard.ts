import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ForbiddenError } from '@/domain/errors';
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

/**
 * Current user from the `ld_session` cookie, or `null`. Request context only.
 *
 * When the session's expiry slid, the cookie's max-age is re-issued too. That
 * only works in a Server Action or Route Handler; Server Components cannot set
 * cookies, so there the DB expiry moves and the cookie keeps its old max-age
 * until the next action refreshes it.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await validateSessionDetailed(token);
  if (!session) return null;
  if (session.extended) {
    const maxAge = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    try {
      store.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
    } catch {
      // Server Component render: cookies are read-only here (see above).
    }
  }
  return session.user;
}

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
