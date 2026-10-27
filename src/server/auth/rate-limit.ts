/**
 * In-memory sliding-window rate limiter: each key may `take` at most `capacity`
 * times within any `windowMs` interval. State lives in this process only, so
 * it resets on restart and is not shared between instances.
 */
export type RateLimiter = { take(key: string, now?: number): boolean };

/** Above this many tracked keys, stale entries are swept on the next `take`. */
const SWEEP_THRESHOLD = 10_000;

export function createRateLimiter(o: { capacity: number; windowMs: number }): RateLimiter & {
  reset(): void;
} {
  const hits = new Map<string, number[]>();

  const sweep = (now: number) => {
    for (const [key, times] of hits) {
      const last = times[times.length - 1];
      if (last === undefined || now - last >= o.windowMs) hits.delete(key);
    }
  };

  return {
    take(key: string, now: number = Date.now()): boolean {
      if (hits.size > SWEEP_THRESHOLD) sweep(now);
      const recent = (hits.get(key) ?? []).filter((t) => now - t < o.windowMs);
      if (recent.length >= o.capacity) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    reset(): void {
      hits.clear();
    },
  };
}

/** Login limiter: 5 attempts per minute per `${ip}:${email}` (successful ones count too). */
export const loginLimiter = createRateLimiter({ capacity: 5, windowMs: 60_000 });

/** Test helper: forgets every recorded login attempt. */
export function resetLoginLimiter(): void {
  loginLimiter.reset();
}
