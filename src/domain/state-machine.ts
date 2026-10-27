import { ForbiddenError, InvalidTransitionError } from '@/domain/errors';
import type { Actor } from '@/domain/roles';

export type TransitionDef<S extends string, E extends string> = {
  from: S | readonly S[];
  event: E;
  to: S;
  actors: readonly Actor[];
};

export interface Machine<S extends string, E extends string> {
  readonly name: string;
  readonly states: readonly S[];
  /**
   * Returns the target state. Throws `InvalidTransitionError` when no def exists for
   * (from, event), and `ForbiddenError` when defs exist but none allows `actor`.
   */
  transition(from: S, event: E, actor: Actor): S;
  can(from: S, event: E, actor: Actor): boolean;
  /** Events `actor` may fire from `from`, in definition order, without duplicates. */
  availableEvents(from: S, actor: Actor): E[];
}

type NormalizedDef<S extends string, E extends string> = {
  from: readonly S[];
  event: E;
  to: S;
  actors: readonly Actor[];
};

const asArray = <S extends string>(from: S | readonly S[]): readonly S[] =>
  typeof from === 'string' ? [from] : from;

/**
 * Builds a pure, I/O-free state machine. Definitions are validated eagerly: an unknown
 * `from`/`to` state or a duplicate (from, event, actor) triple throws a plain `Error`.
 */
export function defineMachine<S extends string, E extends string>(
  name: string,
  states: readonly S[],
  defs: readonly TransitionDef<S, E>[],
): Machine<S, E> {
  const known = new Set<string>(states);
  const seen = new Set<string>();
  const normalized: NormalizedDef<S, E>[] = defs.map((def) => ({
    ...def,
    from: asArray(def.from),
  }));

  for (const def of normalized) {
    for (const state of [...def.from, def.to]) {
      if (!known.has(state)) {
        throw new Error(`Machine ${name}: unknown state "${state}" in ${def.event} definition`);
      }
    }
    for (const from of def.from) {
      for (const actor of def.actors) {
        const key = `${from}|${def.event}|${actor}`;
        if (seen.has(key)) {
          throw new Error(
            `Machine ${name}: duplicate definition for (${from}, ${def.event}, ${actor})`,
          );
        }
        seen.add(key);
      }
    }
  }

  const matching = (from: S, event: E) =>
    normalized.filter((def) => def.event === event && def.from.includes(from));

  const find = (from: S, event: E, actor: Actor) =>
    matching(from, event).find((def) => def.actors.includes(actor));

  return {
    name,
    states,
    transition(from, event, actor) {
      const candidates = matching(from, event);
      if (candidates.length === 0) throw new InvalidTransitionError(name, from, event);
      const def = candidates.find((d) => d.actors.includes(actor));
      if (!def) throw new ForbiddenError(`${actor} may not ${event} a ${name} in ${from}`);
      return def.to;
    },
    can(from, event, actor) {
      return find(from, event, actor) !== undefined;
    },
    availableEvents(from, actor) {
      // The duplicate-triple check guarantees at most one def per (from, event, actor),
      // so collecting matching defs in order cannot yield the same event twice.
      return normalized
        .filter((def) => def.from.includes(from) && def.actors.includes(actor))
        .map((def) => def.event);
    },
  };
}
