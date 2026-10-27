import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  DomainError,
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/domain/errors';
import { errorResponse, toActionError, toHttpStatus } from './errors';

const zodError = () => {
  const r = z.object({ n: z.number() }).safeParse({ n: 'x' });
  if (r.success) throw new Error('expected failure');
  return r.error;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toHttpStatus', () => {
  it.each([
    [new UnauthorizedError(), 401],
    [new ForbiddenError(), 403],
    [new NotFoundError(), 404],
    [new InvalidTransitionError('Deal', 'DRAFT', 'CLOSE'), 409],
    [new ValidationError(), 422],
    [zodError(), 422],
    [new DomainError('SOMETHING_ELSE', 'x'), 500],
    [new Error('db down'), 500],
    ['a string', 500],
    [null, 500],
  ])('maps %s to %i', (err, status) => {
    expect(toHttpStatus(err)).toBe(status);
  });
});

describe('errorResponse', () => {
  it('returns JSON { error: { code, message } } with the mapped status', async () => {
    const res = errorResponse(new ForbiddenError('Role not allowed'));
    expect(res.status).toBe(403);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({
      error: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' },
    });
  });

  it('maps ZodError to 422 VALIDATION', async () => {
    const res = errorResponse(zodError());
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION');
  });

  it('passes through a custom ValidationError message (authored for users)', async () => {
    const res = errorResponse(new ValidationError('NIT inválido'));
    expect(await res.json()).toEqual({ error: { code: 'VALIDATION', message: 'NIT inválido' } });
  });

  it('never leaks internals on 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('password=hunter2 at /srv/app/db.ts:12');
    const res = errorResponse(err);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('db.ts');
    expect(JSON.parse(text)).toEqual({
      error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado. Intenta de nuevo.' },
    });
  });

  it('hides the message of unmapped domain errors too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = errorResponse(new DomainError('WEIRD', 'internal detail'));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('internal detail');
  });
});

describe('toActionError', () => {
  it.each([
    [new UnauthorizedError(), 'Debes iniciar sesión para continuar.'],
    [new ForbiddenError(), 'No tienes permiso para realizar esta acción.'],
    [new NotFoundError(), 'No encontramos el recurso solicitado.'],
    [
      new InvalidTransitionError('Deal', 'DRAFT', 'CLOSE'),
      'Esta acción no está disponible en el estado actual.',
    ],
    [zodError(), 'Revisa los datos ingresados.'],
  ])('maps %s to a Spanish message', (err, message) => {
    expect(toActionError(err)).toEqual({ error: message });
  });

  it('returns a generic Spanish message for unknown errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(toActionError(new Error('secret'))).toEqual({
      error: 'Ocurrió un error inesperado. Intenta de nuevo.',
    });
  });
});
