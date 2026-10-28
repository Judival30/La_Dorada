import { describe, expect, it } from 'vitest';
import { NDA_HASH, NDA_TEXT, ndaHash } from './nda';

describe('demo NDA', () => {
  it('hash is a stable sha256 hex of the exact text', () => {
    expect(NDA_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(ndaHash(NDA_TEXT)).toBe(NDA_HASH);
    expect(ndaHash(`${NDA_TEXT} `)).not.toBe(NDA_HASH);
  });
});
