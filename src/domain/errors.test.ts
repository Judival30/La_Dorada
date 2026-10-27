import { describe, expect, it } from 'vitest';
import {
  DomainError,
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  ValidationError,
} from '@/domain/errors';

describe('DomainError subclasses', () => {
  it('ForbiddenError has code FORBIDDEN and default message', () => {
    const err = new ForbiddenError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Forbidden');
    expect(err.name).toBe('ForbiddenError');
  });

  it('ForbiddenError accepts a custom message', () => {
    expect(new ForbiddenError('No puede aprobar').message).toBe('No puede aprobar');
  });

  it('InvalidTransitionError exposes machine, from, event and code', () => {
    const err = new InvalidTransitionError('Negotiation', 'DRAFT', 'CLOSE');
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('INVALID_TRANSITION');
    expect(err.machine).toBe('Negotiation');
    expect(err.from).toBe('DRAFT');
    expect(err.event).toBe('CLOSE');
    expect(err.message).toBe('Invalid transition in Negotiation: CLOSE from DRAFT');
    expect(err.name).toBe('InvalidTransitionError');
  });

  it('NotFoundError has code NOT_FOUND', () => {
    const err = new NotFoundError('Oportunidad no encontrada');
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Oportunidad no encontrada');
    expect(err.name).toBe('NotFoundError');
  });

  it('ValidationError has code VALIDATION', () => {
    const err = new ValidationError('NIT inválido');
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('NIT inválido');
    expect(err.name).toBe('ValidationError');
  });

  it('DomainError base carries code and message', () => {
    const err = new DomainError('CUSTOM', 'boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('CUSTOM');
    expect(err.message).toBe('boom');
  });
});
