import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from './session';

const state = vi.hoisted(() => ({
  token: undefined as string | undefined,
  user: null as SessionUser | null,
  extended: false,
  setError: new Error(
    'Cookies can only be modified in a Server Action or Route Handler. Read more: x',
  ) as Error | null,
  sets: [] as { name: string; value: string; options: Record<string, unknown> }[],
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'ld_session' && state.token ? { name, value: state.token } : undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => {
      if (state.setError) throw state.setError;
      state.sets.push({ name, value, options });
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
      ? {
          user: state.user,
          sessionId: 's1',
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
          extended: state.extended,
        }
      : null,
}));

import { ForbiddenError, UnauthorizedError } from '@/domain/errors';
import { getCurrentUser, homePathFor, requireActor, requireApplicant, requireUser } from './guard';

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
  state.extended = false;
  state.setError = new Error(
    'Cookies can only be modified in a Server Action or Route Handler. Read more: x',
  );
  state.sets = [];
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

describe('requireActor', () => {
  it('throws UnauthorizedError without a session', async () => {
    await expect(requireActor()).rejects.toBeInstanceOf(UnauthorizedError);
    state.token = 't';
    await expect(requireActor('BUYER')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws ForbiddenError when the user is not ENABLED', async () => {
    state.token = 't';
    state.user = user({ status: 'BLOCKED' });
    await expect(requireActor()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError when the role is not allowed', async () => {
    state.token = 't';
    state.user = user({ role: 'BUYER' });
    await expect(requireActor('SELLER', 'BACKOFFICE')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns the user when enabled and allowed (never redirects)', async () => {
    state.token = 't';
    state.user = user({ role: 'BACKOFFICE' });
    await expect(requireActor('BACKOFFICE')).resolves.toEqual(user({ role: 'BACKOFFICE' }));
    await expect(requireActor()).resolves.toEqual(user({ role: 'BACKOFFICE' }));
  });
});

describe('requireApplicant', () => {
  it('throws UnauthorizedError without a session', async () => {
    await expect(requireApplicant()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('accepts a BUYER or SELLER in any non-ENABLED status (onboarding happens before ENABLED)', async () => {
    state.token = 't';
    for (const role of ['BUYER', 'SELLER'] as const) {
      for (const status of [
        'PENDING',
        'IN_REVIEW',
        'CORRECTIONS_REQUESTED',
        'REJECTED',
        'BLOCKED',
      ] as const) {
        state.user = user({ role, status });
        await expect(requireApplicant()).resolves.toEqual(user({ role, status }));
      }
    }
  });

  it('rejects ENABLED applicants (they use the regular, ENABLED-only endpoints)', async () => {
    state.token = 't';
    state.user = user({ role: 'SELLER', status: 'ENABLED' });
    await expect(requireApplicant()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects BACKOFFICE in any status', async () => {
    state.token = 't';
    for (const status of ['PENDING', 'ENABLED'] as const) {
      state.user = user({ role: 'BACKOFFICE', status });
      await expect(requireApplicant()).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});

describe('getCurrentUser cookie refresh', () => {
  it('re-issues the cookie when the session slid (Server Action / Route Handler)', async () => {
    state.token = 't';
    state.user = user();
    state.extended = true;
    state.setError = null;
    await expect(getCurrentUser()).resolves.toEqual(user());
    expect(state.sets).toHaveLength(1);
    expect(state.sets[0]?.name).toBe('ld_session');
    expect(state.sets[0]?.value).toBe('t');
  });

  it("swallows Next's read-only cookies error (Server Component render)", async () => {
    state.token = 't';
    state.user = user();
    state.extended = true;
    await expect(getCurrentUser()).resolves.toEqual(user());
  });

  it('rethrows any other error from cookies().set', async () => {
    state.token = 't';
    state.user = user();
    state.extended = true;
    state.setError = new TypeError('boom');
    await expect(getCurrentUser()).rejects.toThrow('boom');
  });
});
