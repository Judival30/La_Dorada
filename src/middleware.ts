import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions, sessionMaxAgeSeconds } from '@/server/auth/cookie';

/**
 * Optimistic gate: requests to private areas without an `ld_session` cookie are
 * sent to `/login?next=…`. It never validates the token (no DB in the Edge
 * runtime); the real check is `requireUser` on the server.
 *
 * Sliding cookie: when the cookie is present it is re-issued with the same value
 * and a full `SESSION_TTL_DAYS` max-age, so an active user's browser keeps it.
 * The DB row stays authoritative: an expired or revoked session is still
 * rejected by `validateSession`, whatever the cookie's max-age says.
 */
export function middleware(request: NextRequest): NextResponse {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const response = NextResponse.next();
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(sessionMaxAgeSeconds()));
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

// Keep in sync with PRIVATE_PREFIXES in src/server/auth/safe-next.ts (the
// matcher must be a static literal).
export const config = {
  matcher: [
    '/marketplace/:path*',
    '/saved/:path*',
    '/processes/:path*',
    '/alerts/:path*',
    '/messages/:path*',
    '/seller/:path*',
    '/bo/:path*',
    '/onboarding/:path*',
  ],
};
