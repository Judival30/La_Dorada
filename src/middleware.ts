import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/server/auth/cookie';

/**
 * Optimistic gate: requests to private areas without an `ld_session` cookie are
 * sent to `/login?next=…`. It never validates the token (no DB in the Edge
 * runtime); the real check is `requireUser` on the server.
 */
export function middleware(request: NextRequest): NextResponse {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

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
