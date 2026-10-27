import { describe, expect, it } from 'vitest';
import { ForbiddenError, InvalidTransitionError } from '@/domain/errors';
import type { Actor } from '@/domain/roles';
import {
  OPPORTUNITY_EVENTS,
  OPPORTUNITY_STATUSES,
  opportunityMachine,
  type OpportunityEvent,
  type OpportunityStatus,
} from '@/domain/machines/opportunity';

const cases: [OpportunityStatus, OpportunityEvent, Actor, OpportunityStatus][] = [
  ['DRAFT', 'SUBMIT', 'SELLER', 'IN_REVIEW'],
  ['IN_REVIEW', 'REQUEST_ADJUSTMENTS', 'BACKOFFICE', 'ADJUSTMENTS_REQUESTED'],
  ['ADJUSTMENTS_REQUESTED', 'RESUBMIT', 'SELLER', 'IN_REVIEW'],
  ['IN_REVIEW', 'APPROVE_AND_PUBLISH', 'BACKOFFICE', 'PUBLISHED'],
  ['IN_REVIEW', 'REJECT', 'BACKOFFICE', 'REJECTED'],
  ['PUBLISHED', 'SUSPEND', 'BACKOFFICE', 'SUSPENDED'],
  ['SUSPENDED', 'REINSTATE', 'BACKOFFICE', 'PUBLISHED'],
  ['PUBLISHED', 'WITHDRAW', 'SELLER', 'WITHDRAWN_BY_SELLER'],
  ['PUBLISHED', 'CLOSE', 'SYSTEM', 'CLOSED'],
];

describe('opportunityMachine', () => {
  it('declares the exact states and events', () => {
    expect(OPPORTUNITY_STATUSES).toEqual([
      'DRAFT',
      'IN_REVIEW',
      'ADJUSTMENTS_REQUESTED',
      'PUBLISHED',
      'REJECTED',
      'SUSPENDED',
      'WITHDRAWN_BY_SELLER',
      'CLOSED',
    ]);
    expect(OPPORTUNITY_EVENTS).toEqual([
      'SUBMIT',
      'REQUEST_ADJUSTMENTS',
      'RESUBMIT',
      'APPROVE_AND_PUBLISH',
      'REJECT',
      'SUSPEND',
      'REINSTATE',
      'WITHDRAW',
      'CLOSE',
    ]);
    expect(opportunityMachine.name).toBe('opportunity');
    expect(opportunityMachine.states).toEqual(OPPORTUNITY_STATUSES);
  });

  it.each(cases)('%s --%s(%s)--> %s', (from, event, actor, to) => {
    expect(opportunityMachine.transition(from, event, actor)).toBe(to);
    expect(opportunityMachine.can(from, event, actor)).toBe(true);
  });

  it('R1: a seller cannot approve and publish their own opportunity', () => {
    expect(() =>
      opportunityMachine.transition('IN_REVIEW', 'APPROVE_AND_PUBLISH', 'SELLER'),
    ).toThrow(ForbiddenError);
  });

  it('DRAFT --CLOSE--> throws InvalidTransitionError', () => {
    expect(() => opportunityMachine.transition('DRAFT', 'CLOSE', 'SYSTEM')).toThrow(
      InvalidTransitionError,
    );
  });
});
