import { describe, it, expect } from 'vitest';
import { convertLegacyRecord, summarizeConversion } from './legacy-credit-conversion';
import type { CreditRecord } from '@/types';

function record(total: number, used: number): CreditRecord {
  return { total, used, purchases: [] };
}

describe('convertLegacyRecord', () => {
  it('scales the remaining paid balance by exactly 6x', () => {
    const before = record(20, 5); // remaining 15
    const after = convertLegacyRecord(before);
    expect(after.total - after.used).toBe(90); // 15 * 6
  });

  it('never touches `used` — usage history is preserved exactly', () => {
    const before = record(50, 12);
    const after = convertLegacyRecord(before);
    expect(after.used).toBe(12);
  });

  it('preserves `purchases` untouched (audit trail, same reference)', () => {
    const purchases = [{ id: 'p1', credits: 20, amountTWD: 299, createdAt: '2026-01-01T00:00:00Z' }];
    const before: CreditRecord = { total: 20, used: 0, purchases };
    const after = convertLegacyRecord(before);
    expect(after.purchases).toBe(purchases);
  });

  it('zero remaining stays zero after conversion', () => {
    const before = record(10, 10);
    const after = convertLegacyRecord(before);
    expect(after.total - after.used).toBe(0);
  });

  it('matches the exact worked example: total=20 used=0 -> total=120, remaining=120', () => {
    const before = record(20, 0);
    const after = convertLegacyRecord(before);
    expect(after.total).toBe(120);
    expect(after.used).toBe(0);
  });

  it('never mutates the input record', () => {
    const before = record(20, 5);
    const beforeSnapshot = { ...before };
    convertLegacyRecord(before);
    expect(before).toEqual(beforeSnapshot);
  });
});

describe('summarizeConversion', () => {
  it('reports an exact before/after diff', () => {
    const summary = summarizeConversion(record(20, 5));
    expect(summary).toEqual({
      before: { total: 20, used: 5, remaining: 15 },
      after: { total: 95, used: 5, remaining: 90 },
    });
  });
});
