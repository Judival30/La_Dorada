import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '@/domain/errors';
import { assertRole } from '@/domain/policies/roles';

describe('assertRole', () => {
  it('passes for an ENABLED user with an allowed role', () => {
    expect(() => assertRole({ role: 'BUYER', status: 'ENABLED' }, 'BUYER')).not.toThrow();
  });

  it('passes when the role is one of several allowed roles', () => {
    expect(() =>
      assertRole({ role: 'SELLER', status: 'ENABLED' }, 'BUYER', 'SELLER'),
    ).not.toThrow();
  });

  it('passes for any ENABLED user when no roles are given', () => {
    expect(() => assertRole({ role: 'BACKOFFICE', status: 'ENABLED' })).not.toThrow();
  });

  it('throws ForbiddenError when status is IN_REVIEW', () => {
    expect(() => assertRole({ role: 'BUYER', status: 'IN_REVIEW' }, 'BUYER')).toThrow(
      ForbiddenError,
    );
  });

  it('throws ForbiddenError when not ENABLED even with no roles given', () => {
    expect(() => assertRole({ role: 'BUYER', status: 'BLOCKED' })).toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when the role is not allowed', () => {
    expect(() => assertRole({ role: 'SELLER', status: 'ENABLED' }, 'BUYER')).toThrow(
      ForbiddenError,
    );
  });

  it('throws ForbiddenError when BACKOFFICE is not among allowed roles', () => {
    expect(() => assertRole({ role: 'BACKOFFICE', status: 'ENABLED' }, 'BUYER', 'SELLER')).toThrow(
      ForbiddenError,
    );
  });
});
