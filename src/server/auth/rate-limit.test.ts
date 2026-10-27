import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  it('allows 5 takes per window, rejects the 6th and refills after the window', () => {
    const limiter = createRateLimiter({ capacity: 5, windowMs: 60_000 });
    const t = 1_000_000;

    for (let i = 0; i < 5; i++) expect(limiter.take('k', t)).toBe(true);
    expect(limiter.take('k', t)).toBe(false);
    expect(limiter.take('k', t + 60_001)).toBe(true);
  });

  it('keeps keys independent', () => {
    const limiter = createRateLimiter({ capacity: 1, windowMs: 60_000 });
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 0)).toBe(false);
    expect(limiter.take('b', 0)).toBe(true);
  });
});
