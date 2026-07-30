import { describe, it, expect } from 'vitest';
import { shouldApplyWatermark } from './watermark';

describe('shouldApplyWatermark — fail-safe direction', () => {
  it('applies the watermark when the decision is missing (undefined)', () => {
    expect(shouldApplyWatermark(undefined)).toBe(true);
  });

  it('applies the watermark when explicitly true', () => {
    expect(shouldApplyWatermark(true)).toBe(true);
  });

  it('does NOT apply the watermark only when explicitly false', () => {
    expect(shouldApplyWatermark(false)).toBe(false);
  });
});
