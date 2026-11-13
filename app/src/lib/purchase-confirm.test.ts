import { describe, it, expect } from 'vitest';
import { isPurchaseConfirmed } from './purchase-confirm';

describe('isPurchaseConfirmed', () => {
  it('is not confirmed while a returning customer still shows the old balance', () => {
    expect(isPurchaseConfirmed(7, 7)).toBe(false);
  });
  it('is confirmed once the balance rises above the one seen before paying', () => {
    expect(isPurchaseConfirmed(27, 7)).toBe(true);
  });
  it('a first-time buyer with a zero balance before is confirmed by any credits', () => {
    expect(isPurchaseConfirmed(0, 0)).toBe(false);
    expect(isPurchaseConfirmed(20, 0)).toBe(true);
  });
  it('falls back to "has credits" when the earlier balance is unknown', () => {
    expect(isPurchaseConfirmed(0)).toBe(false);
    expect(isPurchaseConfirmed(3, null)).toBe(true);
  });
});
