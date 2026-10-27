import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from './session';

const state = vi.hoisted(() => ({
  token: undefined as string | undefined,
  user: null as SessionUser | null,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'ld_session' && state.token ? { name, value: state.token } : undefined,
    set: () => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler');
    },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url};307;`,
    });
  },
  notFound: () => {
    throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), {
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
  },
}));

vi.mock('./session', () => ({
  SESSION_COOKIE: 'ld_session',
  validateSessionDetailed: async () =>
    state.user
      ? { user: state.user, sessionId: 's1', expiresAt: new Date(), extended: false }
      : null,
}));

import { getCurrentUser, homePathFor, requireUser } from './guard';

const user = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 'u1',
  email: 'comprador@demo.ladorada.co',
  name: 'Comprador',
  role: 'BUYER',
  status: 'ENABLED',
  ...over,
});

const digestOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return (err as { digest?: string }).digest;
  }
  return undefined;
};

beforeEach(() => {
  state.token = undefined;
  state.user = null;
});

describe('homePathFor', () => {
  it('maps each role to its home', () => {
    expect(homePathFor('BUYER')).toBe('/marketplace');
    expect(homePathFor('SELLER')).toBe('/seller');
    expect(homePathFor('BACKOFFICE')).toBe('/bo');
  });
});

describe('requireUser', () => {
  it('redirects to /login without a session', async () => {
    expect(await digestOf(requireUser())).toContain(';/login;');
    expect(await getCurrentUser()).toBeNull();
  });

  it('redirects to /onboarding when the user is not ENABLED', async () => {
    state.token = 't';
    state.user = user({ status: 'IN_REVIEW' });
    expect(await digestOf(requireUser('BUYER'))).toContain(';/onboarding;');
  });

  it('responds notFound when the role is not allowed', async () => {
    state.token = 't';
    state.user = user({ role: 'BUYER' });
    expect(await digestOf(requireUser('BACKOFFICE'))).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('returns the user when enabled and allowed', async () => {
    state.token = 't';
    state.user = user({ role: 'SELLER' });
    await expect(requireUser('SELLER', 'BACKOFFICE')).resolves.toEqual(user({ role: 'SELLER' }));
    await expect(requireUser()).resolves.toEqual(user({ role: 'SELLER' }));
  });
});
