/**
 * Session cookie name and options. Kept free of Node-only imports so the
 * Edge middleware can share them with the server code.
 */
export const SESSION_COOKIE = 'ld_session';

const DEFAULT_TTL_DAYS = 7;

/**
 * Session lifetime in days, read straight from `process.env` so it works in the
 * Edge runtime (the Zod `env` module is server-only). Missing, non-numeric or
 * non-positive values fall back to 7, matching the `env.ts` default.
 */
export function sessionTtlDays(): number {
  const days = Number(process.env.SESSION_TTL_DAYS);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS;
}

/** Full session lifetime in seconds, for the cookie's `maxAge`. */
export function sessionMaxAgeSeconds(): number {
  return Math.floor(sessionTtlDays() * 86_400);
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
