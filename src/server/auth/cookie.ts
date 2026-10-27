/**
 * Session cookie name and options. Kept free of Node-only imports so the
 * Edge middleware can share them with the server code.
 */
export const SESSION_COOKIE = 'ld_session';

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
