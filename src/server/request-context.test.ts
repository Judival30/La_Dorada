import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: {} as Record<string, string> }));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(mocks.headers),
}));

import { clientIp, getRequestContext, userAgent } from './request-context';

beforeEach(() => {
  mocks.headers = {};
});

describe('clientIp', () => {
  it('prefers x-real-ip', async () => {
    mocks.headers = { 'x-real-ip': ' 10.0.0.9 ', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' };
    expect(await clientIp()).toBe('10.0.0.9');
  });

  it('uses the LAST x-forwarded-for entry (proxy-written), never the first', async () => {
    mocks.headers = { 'x-forwarded-for': '6.6.6.6, 203.0.113.7 ' };
    expect(await clientIp()).toBe('203.0.113.7');
  });

  it('ignores a blank x-real-ip', async () => {
    mocks.headers = { 'x-real-ip': '  ', 'x-forwarded-for': '203.0.113.7' };
    expect(await clientIp()).toBe('203.0.113.7');
  });

  it('falls back to 127.0.0.1', async () => {
    expect(await clientIp()).toBe('127.0.0.1');
    mocks.headers = { 'x-forwarded-for': 'a, ' };
    expect(await clientIp()).toBe('127.0.0.1');
  });
});

describe('userAgent / getRequestContext', () => {
  it('returns the user-agent or null', async () => {
    expect(await userAgent()).toBeNull();
    mocks.headers = { 'user-agent': 'Vitest/1.0' };
    expect(await userAgent()).toBe('Vitest/1.0');
  });

  it('bundles ip and user agent', async () => {
    mocks.headers = { 'x-real-ip': '10.0.0.1', 'user-agent': 'UA' };
    expect(await getRequestContext()).toEqual({ ip: '10.0.0.1', userAgent: 'UA' });
  });
});
