import { describe, expect, it } from 'vitest';
import { ForbiddenError, InvalidTransitionError } from '@/domain/errors';
import type { Actor } from '@/domain/roles';
import {
  USER_EVENTS,
  USER_STATUSES,
  userMachine,
  type UserEvent,
  type UserStatus,
} from '@/domain/machines/user';

const cases: [UserStatus, UserEvent, Actor, UserStatus][] = [
  ['PENDING', 'SUBMIT', 'BUYER', 'IN_REVIEW'],
  ['PENDING', 'SUBMIT', 'SELLER', 'IN_REVIEW'],
  ['IN_REVIEW', 'REQUEST_CORRECTIONS', 'BACKOFFICE', 'CORRECTIONS_REQUESTED'],
  ['CORRECTIONS_REQUESTED', 'RESUBMIT', 'BUYER', 'IN_REVIEW'],
  ['CORRECTIONS_REQUESTED', 'RESUBMIT', 'SELLER', 'IN_REVIEW'],
  ['IN_REVIEW', 'APPROVE', 'BACKOFFICE', 'ENABLED'],
  ['IN_REVIEW', 'REJECT', 'BACKOFFICE', 'REJECTED'],
  ['ENABLED', 'BLOCK', 'BACKOFFICE', 'BLOCKED'],
  ['BLOCKED', 'UNBLOCK', 'BACKOFFICE', 'ENABLED'],
];

describe('userMachine', () => {
  it('declares the exact states and events', () => {
    expect(USER_STATUSES).toEqual([
      'PENDING',
      'IN_REVIEW',
      'CORRECTIONS_REQUESTED',
      'ENABLED',
      'REJECTED',
      'BLOCKED',
    ]);
    expect(USER_EVENTS).toEqual([
      'SUBMIT',
      'REQUEST_CORRECTIONS',
      'RESUBMIT',
      'APPROVE',
      'REJECT',
      'BLOCK',
      'UNBLOCK',
    ]);
    expect(userMachine.name).toBe('user');
    expect(userMachine.states).toEqual(USER_STATUSES);
  });

  it.each(cases)('%s --%s(%s)--> %s', (from, event, actor, to) => {
    expect(userMachine.transition(from, event, actor)).toBe(to);
    expect(userMachine.can(from, event, actor)).toBe(true);
  });

  it('PENDING --APPROVE--> throws InvalidTransitionError', () => {
    expect(() => userMachine.transition('PENDING', 'APPROVE', 'BACKOFFICE')).toThrow(
      InvalidTransitionError,
    );
  });

  it('a user cannot approve themselves', () => {
    expect(() => userMachine.transition('IN_REVIEW', 'APPROVE', 'BUYER')).toThrow(ForbiddenError);
  });
});
