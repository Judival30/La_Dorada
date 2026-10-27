import { describe, expect, it } from 'vitest';
import { ForbiddenError, InvalidTransitionError } from '@/domain/errors';
import { defineMachine } from '@/domain/state-machine';

const STATES = ['A', 'B', 'C'] as const;
type S = (typeof STATES)[number];
type E = 'GO' | 'BACK' | 'JUMP';

const machine = defineMachine<S, E>('test', STATES, [
  { from: 'A', event: 'GO', to: 'B', actors: ['BUYER'] },
  { from: 'B', event: 'BACK', to: 'A', actors: ['SELLER', 'BACKOFFICE'] },
  { from: ['A', 'B'], event: 'JUMP', to: 'C', actors: ['SYSTEM'] },
  { from: 'A', event: 'GO', to: 'C', actors: ['SELLER'] },
]);

describe('defineMachine', () => {
  it('exposes name and states', () => {
    expect(machine.name).toBe('test');
    expect(machine.states).toEqual(['A', 'B', 'C']);
  });

  it('resolves the target per actor and supports array `from`', () => {
    expect(machine.transition('A', 'GO', 'BUYER')).toBe('B');
    expect(machine.transition('A', 'GO', 'SELLER')).toBe('C');
    expect(machine.transition('A', 'JUMP', 'SYSTEM')).toBe('C');
    expect(machine.transition('B', 'JUMP', 'SYSTEM')).toBe('C');
  });

  it('throws InvalidTransitionError when no def matches (from, event)', () => {
    expect(() => machine.transition('C', 'GO', 'BUYER')).toThrow(InvalidTransitionError);
    expect(() => machine.transition('C', 'GO', 'BUYER')).toThrow(
      expect.objectContaining({ machine: 'test', from: 'C', event: 'GO' }),
    );
  });

  it('throws ForbiddenError when defs exist but the actor is not allowed', () => {
    expect(() => machine.transition('A', 'GO', 'BACKOFFICE')).toThrow(ForbiddenError);
  });

  it('can() mirrors transition()', () => {
    expect(machine.can('A', 'GO', 'BUYER')).toBe(true);
    expect(machine.can('A', 'GO', 'BACKOFFICE')).toBe(false);
    expect(machine.can('C', 'GO', 'BUYER')).toBe(false);
  });

  it('availableEvents() returns events in definition order', () => {
    expect(machine.availableEvents('A', 'SELLER')).toEqual(['GO']);
    expect(machine.availableEvents('A', 'SYSTEM')).toEqual(['JUMP']);
    expect(machine.availableEvents('B', 'SYSTEM')).toEqual(['JUMP']);
    expect(machine.availableEvents('B', 'BACKOFFICE')).toEqual(['BACK']);
    expect(machine.availableEvents('C', 'BUYER')).toEqual([]);
  });

  it('availableEvents() does not repeat an event reachable through several defs', () => {
    const m = defineMachine<S, E>('twice', STATES, [
      { from: 'A', event: 'GO', to: 'B', actors: ['BUYER'] },
      { from: 'A', event: 'JUMP', to: 'C', actors: ['BUYER'] },
      { from: ['A', 'C'], event: 'GO', to: 'C', actors: ['SELLER'] },
      { from: 'A', event: 'GO', to: 'C', actors: ['SYSTEM'] },
    ]);
    expect(m.availableEvents('A', 'BUYER')).toEqual(['GO', 'JUMP']);
    expect(m.availableEvents('A', 'SELLER')).toEqual(['GO']);
  });

  it('throws on a duplicate (from, event, actor) triple', () => {
    expect(() =>
      defineMachine<S, E>('bad', STATES, [
        { from: 'A', event: 'GO', to: 'B', actors: ['BUYER'] },
        { from: ['B', 'A'], event: 'GO', to: 'C', actors: ['SELLER', 'BUYER'] },
      ]),
    ).toThrow(/duplicate/i);
  });

  it('throws when a `to` state is not in states', () => {
    expect(() =>
      defineMachine<S, E>('bad', STATES, [
        { from: 'A', event: 'GO', to: 'Z' as S, actors: ['BUYER'] },
      ]),
    ).toThrow(/unknown/i);
  });

  it('throws when a `from` state is not in states', () => {
    expect(() =>
      defineMachine<S, E>('bad', STATES, [
        { from: ['A', 'Z' as S], event: 'GO', to: 'B', actors: ['BUYER'] },
      ]),
    ).toThrow(/unknown/i);
  });
});
