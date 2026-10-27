import { headers } from 'next/headers';

/**
 * Per-request client metadata for auditing, sessions and rate limiting.
 * Request context only (Server Action, Route Handler or Server Component).
 */
export type RequestContext = { ip: string; userAgent: string | null };

/**
 * Client IP.
 *
 * TRUSTED-PROXY ASSUMPTION: the app runs behind exactly one reverse proxy that
 * sets `x-real-ip` and/or appends the peer address to `x-forwarded-for`. Only
 * that proxy-written value is used (`x-real-ip`, else the LAST XFF entry); the
 * first XFF entries are client-controlled and trivially spoofed. Exposed
 * directly to the internet without such a proxy, these headers are untrusted.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const realIp = h.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const last = h.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return last || '127.0.0.1';
}

/** Raw `User-Agent` header, or `null` when absent. */
export async function userAgent(): Promise<string | null> {
  return (await headers()).get('user-agent');
}

export async function getRequestContext(): Promise<RequestContext> {
  const [ip, ua] = await Promise.all([clientIp(), userAgent()]);
  return { ip, userAgent: ua };
}
