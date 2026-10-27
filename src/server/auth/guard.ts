import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ForbiddenError } from '@/domain/errors';
import { assertRole } from '@/domain/policies/roles';
import type { Role } from '@/domain/roles';
import { SESSION_COOKIE, validateSession, type SessionUser } from './session';

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

/** Current user from the `ld_session` cookie, or `null`. Request context only. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (await validateSession(token))?.user ?? null;
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
