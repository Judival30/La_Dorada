import { describe, expect, it } from 'vitest';
import { ForbiddenError, InvalidTransitionError } from '@/domain/errors';
import type { Actor } from '@/domain/roles';
import {
  DEAL_EVENTS,
  DEAL_STATUSES,
  TERMINAL_DEAL_STATUSES,
  dealMachine,
  type DealEvent,
  type DealStatus,
} from '@/domain/machines/deal';

const NON_TERMINAL: DealStatus[] = [
  'OFFER_SENT',
  'COUNTER_OFFER',
  'PRELIMINARY_AGREEMENT',
  'LOI_SIGNED',
  'DUE_DILIGENCE',
];

const cases: [DealStatus, DealEvent, Actor, DealStatus][] = [
  ['OFFER_SENT', 'COUNTER', 'SELLER', 'COUNTER_OFFER'],
  ['COUNTER_OFFER', 'COUNTER', 'BUYER', 'OFFER_SENT'],
  ['OFFER_SENT', 'ACCEPT', 'BUYER', 'PRELIMINARY_AGREEMENT'],
  ['OFFER_SENT', 'ACCEPT', 'SELLER', 'PRELIMINARY_AGREEMENT'],
  ['COUNTER_OFFER', 'ACCEPT', 'BUYER', 'PRELIMINARY_AGREEMENT'],
  ['COUNTER_OFFER', 'ACCEPT', 'SELLER', 'PRELIMINARY_AGREEMENT'],
  ['PRELIMINARY_AGREEMENT', 'SIGN_LOI', 'BUYER', 'LOI_SIGNED'],
  ['PRELIMINARY_AGREEMENT', 'SIGN_LOI', 'SELLER', 'LOI_SIGNED'],
  ['LOI_SIGNED', 'START_DD', 'BUYER', 'DUE_DILIGENCE'],
  ['LOI_SIGNED', 'START_DD', 'SELLER', 'DUE_DILIGENCE'],
  ['DUE_DILIGENCE', 'RENEGOTIATE', 'BUYER', 'COUNTER_OFFER'],
  ['DUE_DILIGENCE', 'RENEGOTIATE', 'SELLER', 'COUNTER_OFFER'],
  ['DUE_DILIGENCE', 'CONFIRM_CLOSE', 'BUYER', 'CLOSED'],
  ['DUE_DILIGENCE', 'CONFIRM_CLOSE', 'SELLER', 'CLOSED'],
  ...NON_TERMINAL.flatMap((s): [DealStatus, DealEvent, Actor, DealStatus][] => [
    [s, 'WITHDRAW', 'BUYER', 'WITHDRAWN'],
    [s, 'WITHDRAW', 'SELLER', 'WITHDRAWN'],
  ]),
];

describe('dealMachine', () => {
  it('declares the exact states, events and terminal states', () => {
    expect(DEAL_STATUSES).toEqual([
      'OFFER_SENT',
      'COUNTER_OFFER',
      'PRELIMINARY_AGREEMENT',
      'LOI_SIGNED',
      'DUE_DILIGENCE',
      'CLOSED',
      'WITHDRAWN',
    ]);
    expect(DEAL_EVENTS).toEqual([
      'COUNTER',
      'ACCEPT',
      'SIGN_LOI',
      'START_DD',
      'RENEGOTIATE',
      'CONFIRM_CLOSE',
      'WITHDRAW',
    ]);
    expect(TERMINAL_DEAL_STATUSES).toEqual(['CLOSED', 'WITHDRAWN']);
    expect(dealMachine.name).toBe('deal');
    expect(dealMachine.states).toEqual(DEAL_STATUSES);
  });

  it.each(cases)('%s --%s(%s)--> %s', (from, event, actor, to) => {
    expect(dealMachine.transition(from, event, actor)).toBe(to);
    expect(dealMachine.can(from, event, actor)).toBe(true);
  });

  it('COUNTER is directional: the seller counters an offer, the buyer counters a counter-offer', () => {
    expect(() => dealMachine.transition('OFFER_SENT', 'COUNTER', 'BUYER')).toThrow(ForbiddenError);
    expect(() => dealMachine.transition('COUNTER_OFFER', 'COUNTER', 'SELLER')).toThrow(
      ForbiddenError,
    );
  });

  it('R4: BACKOFFICE can never transition a deal', () => {
    for (const state of DEAL_STATUSES) {
      for (const event of DEAL_EVENTS) {
        expect(dealMachine.can(state, event, 'BACKOFFICE')).toBe(false);
      }
      expect(dealMachine.availableEvents(state, 'BACKOFFICE')).toEqual([]);
    }
  });

  it.each(NON_TERMINAL)('R5: WITHDRAW from %s by BUYER yields WITHDRAWN', (state) => {
    expect(dealMachine.transition(state, 'WITHDRAW', 'BUYER')).toBe('WITHDRAWN');
  });

  it.each(TERMINAL_DEAL_STATUSES)('R5: WITHDRAW from terminal %s throws', (state) => {
    expect(() => dealMachine.transition(state, 'WITHDRAW', 'BUYER')).toThrow(
      InvalidTransitionError,
    );
  });

  it('terminal states have no available events', () => {
    for (const state of TERMINAL_DEAL_STATUSES) {
      expect(dealMachine.availableEvents(state, 'BUYER')).toEqual([]);
      expect(dealMachine.availableEvents(state, 'SELLER')).toEqual([]);
    }
  });

  it('availableEvents for DUE_DILIGENCE by BUYER follows definition order', () => {
    expect(dealMachine.availableEvents('DUE_DILIGENCE', 'BUYER')).toEqual([
      'RENEGOTIATE',
      'CONFIRM_CLOSE',
      'WITHDRAW',
    ]);
  });
});
