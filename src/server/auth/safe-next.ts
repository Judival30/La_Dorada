/**
 * Private areas a post-login `next` may point to (same list as the middleware
 * matcher, which must stay a static literal there).
 */
export const PRIVATE_PREFIXES = [
  '/marketplace',
  '/saved',
  '/processes',
  '/alerts',
  '/messages',
  '/seller',
  '/bo',
  '/onboarding',
] as const;

const PROBE_ORIGIN = 'http://local.invalid';

/**
 * Validates a post-login destination. Returns a normalized same-origin path
 * inside a private area, or `null` (callers then fall back to the role home).
 *
 * Control characters and backslashes are rejected outright: browsers strip
 * tab/CR/LF and treat `\` as `/`, so `/\t/evil.com` or `/\evil.com` would
 * otherwise become the protocol-relative `//evil.com`.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (/[\x00-\x1F\x7F\\]/.test(next)) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(next, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;

  const { pathname } = url;
  const allowed = PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return allowed ? pathname + url.search + url.hash : null;
}
