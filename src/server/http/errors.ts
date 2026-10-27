import { ZodError } from 'zod';
import { DomainError, ValidationError } from '@/domain/errors';

/**
 * Error → HTTP mapping for Route Handlers and Server Actions (spec §3.1).
 * Only known domain codes are exposed; anything else is a 500 with a generic
 * Spanish message, and the original error is logged server-side only.
 */

type PublicCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_TRANSITION' | 'VALIDATION';

const STATUS: Record<PublicCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  VALIDATION: 422,
};

const MESSAGES: Record<PublicCode | 'INTERNAL', string> = {
  UNAUTHORIZED: 'Debes iniciar sesión para continuar.',
  FORBIDDEN: 'No tienes permiso para realizar esta acción.',
  NOT_FOUND: 'No encontramos el recurso solicitado.',
  INVALID_TRANSITION: 'Esta acción no está disponible en el estado actual.',
  VALIDATION: 'Revisa los datos ingresados.',
  INTERNAL: 'Ocurrió un error inesperado. Intenta de nuevo.',
};

const DEFAULT_VALIDATION_MESSAGE = new ValidationError().message;

function isPublicCode(code: string): code is PublicCode {
  return Object.hasOwn(STATUS, code);
}

function classify(err: unknown): { code: PublicCode | 'INTERNAL'; message: string } {
  if (err instanceof ZodError) return { code: 'VALIDATION', message: MESSAGES.VALIDATION };
  if (err instanceof DomainError && isPublicCode(err.code)) {
    // ValidationError messages are authored for end users (e.g. "NIT inválido").
    const custom = err instanceof ValidationError && err.message !== DEFAULT_VALIDATION_MESSAGE;
    return { code: err.code, message: custom ? err.message : MESSAGES[err.code] };
  }
  console.error('[unhandled error]', err);
  return { code: 'INTERNAL', message: MESSAGES.INTERNAL };
}

/** HTTP status for an error: 401/403/404/409/422 for known codes (ZodError → 422), else 500. */
export function toHttpStatus(err: unknown): number {
  if (err instanceof ZodError) return 422;
  if (err instanceof DomainError && isPublicCode(err.code)) return STATUS[err.code];
  return 500;
}

/** JSON error response `{ error: { code, message } }`. 500s never carry internal details. */
export function errorResponse(err: unknown): Response {
  const { code, message } = classify(err);
  return Response.json({ error: { code, message } }, { status: toHttpStatus(err) });
}

/** Server Action result for a failure, with a Spanish message safe to show in the UI. */
export function toActionError(err: unknown): { error: string } {
  return { error: classify(err).message };
}
