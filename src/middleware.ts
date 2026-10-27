import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/server/auth/cookie';

/**
 * Optimistic gate: requests to private areas without an `ld_session` cookie are
 * sent to `/login?next=…`. It never validates the token (no DB in the Edge
 * runtime); the real check is `requireUser` on the server.
 *
 * When the cookie is present its max-age is refreshed, so the browser keeps it
 * for as long as the server-side session slides (the DB stays authoritative).
 */
export function middleware(request: NextRequest): NextResponse {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const ttlDays = Number(process.env.SESSION_TTL_DAYS) || 7;
  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(ttlDays * 86_400));
  return response;
}

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
