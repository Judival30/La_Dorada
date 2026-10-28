/**
 * In-memory sliding-window rate limiter: each key may `take` at most `capacity`
 * times within any `windowMs` interval. State lives in this process only, so
 * it resets on restart and is not shared between instances.
 */
export type RateLimiter = { take(key: string, now?: number): boolean };

export function createRateLimiter(o: { capacity: number; windowMs: number }): RateLimiter & {
  reset(): void;
} {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  /** Drops keys with no hit inside the window. Runs at most once per window. */
  const sweep = (now: number) => {
    if (now - lastSweep < o.windowMs) return;
    lastSweep = now;
    for (const [key, times] of hits) {
      const last = times[times.length - 1];
      if (last === undefined || now - last >= o.windowMs) hits.delete(key);
    }
  };

  return {
    take(key: string, now: number = Date.now()): boolean {
      sweep(now);
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
      lastSweep = 0;
    },
  };
}

/** 5 attempts per minute per `${ip}:${email}` (successful attempts count too). */
export const loginLimiter = createRateLimiter({ capacity: 5, windowMs: 60_000 });

/** 20 attempts per 15 minutes per email, whatever the IP (distributed guessing). */
export const loginEmailLimiter = createRateLimiter({ capacity: 20, windowMs: 15 * 60_000 });

/** Test helper: forgets every recorded login attempt in both buckets. */
export function resetLoginLimiter(): void {
  loginLimiter.reset();
  loginEmailLimiter.reset();
}

/**
 * 5 sign-up attempts per 15 minutes per IP. Counted after input validation and
 * before the (costly) password hash, so duplicates count too.
 */
export const registerIpLimiter = createRateLimiter({ capacity: 5, windowMs: 15 * 60_000 });

/** Test helper: forgets every recorded sign-up attempt. */
export function resetRegisterLimiter(): void {
  registerIpLimiter.reset();
}

/**
 * 20 verification-document uploads per 10 minutes per user id (spec §3.2).
 * Checked before the request body is read.
 */
export const uploadLimiter = createRateLimiter({ capacity: 20, windowMs: 10 * 60_000 });

/** Test helper: forgets every recorded upload. */
export function resetUploadLimiter(): void {
  uploadLimiter.reset();
}

/** Test helper: resets every limiter in this module (login, sign-up and upload). */
export function resetRateLimiters(): void {
  resetLoginLimiter();
  resetRegisterLimiter();
  resetUploadLimiter();
}
