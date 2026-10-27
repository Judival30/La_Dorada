import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';
import { SESSION_COOKIE, sessionMaxAgeSeconds, sessionTtlDays } from '@/server/auth/cookie';

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : undefined,
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('middleware', () => {
  it('redirects to /login?next=… without a session cookie and sets no cookie', () => {
    const res = middleware(req('/seller/companies?tab=1'));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/seller/companies?tab=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('re-issues the session cookie with the same value and a full TTL (sliding)', () => {
    vi.stubEnv('SESSION_TTL_DAYS', '7');
    const res = middleware(req('/marketplace', `${SESSION_COOKIE}=tok-123; other=x`));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');

    const c = res.cookies.get(SESSION_COOKIE);
    expect(c?.value).toBe('tok-123');
    expect(c?.maxAge).toBe(7 * 86_400);
    expect(c?.httpOnly).toBe(true);
    expect(c?.sameSite).toBe('lax');
    expect(c?.path).toBe('/');
    expect(c?.secure).toBe(false);

    const header = res.headers.get('set-cookie') ?? '';
    expect(header).toMatch(/ld_session=tok-123/);
    expect(header).toMatch(/Max-Age=604800/i);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).not.toMatch(/other=/);
  });

  it('uses SESSION_TTL_DAYS and marks the cookie secure in production', () => {
    vi.stubEnv('SESSION_TTL_DAYS', '2');
    vi.stubEnv('NODE_ENV', 'production');
    const c = middleware(req('/bo', `${SESSION_COOKIE}=t`)).cookies.get(SESSION_COOKIE);
    expect(c?.maxAge).toBe(2 * 86_400);
    expect(c?.secure).toBe(true);
  });
});

describe('sessionTtlDays', () => {
  it.each([
    [undefined, 7],
    ['', 7],
    ['abc', 7],
    ['0', 7],
    ['-3', 7],
    ['14', 14],
  ])('reads %s as %i days', (raw, days) => {
    if (raw === undefined) vi.stubEnv('SESSION_TTL_DAYS', undefined);
    else vi.stubEnv('SESSION_TTL_DAYS', raw);
    expect(sessionTtlDays()).toBe(days);
    expect(sessionMaxAgeSeconds()).toBe(days * 86_400);
  });
});
