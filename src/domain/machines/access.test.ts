import { describe, expect, it } from 'vitest';
import { ForbiddenError, InvalidTransitionError } from '@/domain/errors';
import type { Actor } from '@/domain/roles';
import {
  ACCESS_EVENTS,
  ACCESS_STATUSES,
  accessMachine,
  type AccessEvent,
  type AccessStatus,
} from '@/domain/machines/access';

const cases: [AccessStatus, AccessEvent, Actor, AccessStatus][] = [
  ['REQUESTED', 'SIGN_NDA', 'BUYER', 'NDA_SIGNED'],
  ['NDA_SIGNED', 'APPROVE', 'SELLER', 'AUTHORIZED'],
  ['REQUESTED', 'REJECT', 'SELLER', 'REJECTED'],
  ['NDA_SIGNED', 'REJECT', 'SELLER', 'REJECTED'],
  ['AUTHORIZED', 'REVOKE', 'SELLER', 'REVOKED'],
  ['AUTHORIZED', 'REVOKE', 'BACKOFFICE', 'REVOKED'],
];

describe('accessMachine', () => {
  it('declares the exact states and events', () => {
    expect(ACCESS_STATUSES).toEqual([
      'REQUESTED',
      'NDA_SIGNED',
      'AUTHORIZED',
      'REJECTED',
      'REVOKED',
    ]);
    expect(ACCESS_EVENTS).toEqual(['SIGN_NDA', 'APPROVE', 'REJECT', 'REVOKE']);
    expect(accessMachine.name).toBe('access');
    expect(accessMachine.states).toEqual(ACCESS_STATUSES);
  });

  it.each(cases)('%s --%s(%s)--> %s', (from, event, actor, to) => {
    expect(accessMachine.transition(from, event, actor)).toBe(to);
    expect(accessMachine.can(from, event, actor)).toBe(true);
  });

  it("availableEvents('AUTHORIZED', 'BACKOFFICE') is ['REVOKE']", () => {
    expect(accessMachine.availableEvents('AUTHORIZED', 'BACKOFFICE')).toEqual(['REVOKE']);
  });

  it('a buyer cannot authorize their own access', () => {
    expect(() => accessMachine.transition('NDA_SIGNED', 'APPROVE', 'BUYER')).toThrow(
      ForbiddenError,
    );
  });

  it('APPROVE without a signed NDA throws InvalidTransitionError', () => {
    expect(() => accessMachine.transition('REQUESTED', 'APPROVE', 'SELLER')).toThrow(
      InvalidTransitionError,
    );
  });
});
