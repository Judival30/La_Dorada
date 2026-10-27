import { describe, expect, it } from 'vitest';
import { isPartyConflict } from '@/domain/policies/parties';

describe('isPartyConflict', () => {
  it('is true when the user is the seller of the opportunity', () => {
    expect(isPartyConflict('seller-1', { sellerId: 'seller-1' })).toBe(true);
  });

  it('is false when the user is not the seller', () => {
    expect(isPartyConflict('buyer-1', { sellerId: 'seller-1' })).toBe(false);
  });
});
