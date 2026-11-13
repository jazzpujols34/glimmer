/**
 * Has the payment landed yet? The success page can load before the payment
 * provider's notice arrives, so "has credits" is not proof for a customer who
 * already had some — only a balance above the one seen before paying is.
 * Without a known earlier balance, fall back to "has any credits".
 */
export function isPurchaseConfirmed(remaining: number, remainingBefore?: number | null): boolean {
  return typeof remainingBefore === 'number' ? remaining > remainingBefore : remaining > 0;
}
