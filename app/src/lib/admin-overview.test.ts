import { describe, it, expect } from 'vitest';
import { buildOverview } from './admin-overview';
import type { CreditRecord } from '@/types';

function credit(email: string, total: number, used: number, purchases: CreditRecord['purchases'] = []): { email: string; record: CreditRecord } {
  return { email, record: { total, used, purchases } };
}

describe('buildOverview — spend', () => {
  it('maps each date to its recorded tokens and USD cost at $1.2/M', () => {
    const result = buildOverview({
      spendByDate: { '2026-08-01': 1000000, '2026-08-02': 500000 },
      dates: ['2026-08-01', '2026-08-02'],
      cap: 15000000,
      creditRecords: [],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.spend.days).toEqual([
      { date: '2026-08-01', tokens: 1000000, estCostUSD: 1.2 },
      { date: '2026-08-02', tokens: 500000, estCostUSD: 0.6 },
    ]);
  });

  it('missing dates in spendByDate default to 0 tokens', () => {
    const result = buildOverview({
      spendByDate: {},
      dates: ['2026-08-01', '2026-08-02'],
      cap: 15000000,
      creditRecords: [],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.spend.days.every(d => d.tokens === 0)).toBe(true);
  });

  it('today is the last entry in `dates`', () => {
    const result = buildOverview({
      spendByDate: { '2026-08-02': 42 },
      dates: ['2026-08-01', '2026-08-02'],
      cap: 15000000,
      creditRecords: [],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.spend.today).toEqual({ date: '2026-08-02', tokens: 42, estCostUSD: 42 / 1_000_000 * 1.2 });
  });

  it('remaining headroom is cap minus today spend, floored at 0', () => {
    const result = buildOverview({
      spendByDate: { '2026-08-02': 14000000 },
      dates: ['2026-08-02'],
      cap: 15000000,
      creditRecords: [],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.spend.remaining).toBe(1000000);
    expect(result.spend.capped).toBe(false);
  });

  it('capped is true once today spend reaches the cap', () => {
    const result = buildOverview({
      spendByDate: { '2026-08-02': 15000000 },
      dates: ['2026-08-02'],
      cap: 15000000,
      creditRecords: [],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.spend.capped).toBe(true);
    expect(result.spend.remaining).toBe(0);
  });

  it('remaining never goes negative when today spend overshoots the cap', () => {
    const result = buildOverview({
      spendByDate: { '2026-08-02': 20000000 },
      dates: ['2026-08-02'],
      cap: 15000000,
      creditRecords: [],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.spend.remaining).toBe(0);
  });

  it('cap=0 (disabled) reports remaining=null and never capped', () => {
    const result = buildOverview({
      spendByDate: { '2026-08-02': 999999999 },
      dates: ['2026-08-02'],
      cap: 0,
      creditRecords: [],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.spend.remaining).toBeNull();
    expect(result.spend.capped).toBe(false);
    expect(result.spend.cap).toBe(0);
  });

  it('empty dates array degrades to a zeroed today rather than throwing', () => {
    const result = buildOverview({
      spendByDate: {},
      dates: [],
      cap: 15000000,
      creditRecords: [],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.spend.days).toEqual([]);
    expect(result.spend.today.tokens).toBe(0);
  });
});

describe('buildOverview — revenue', () => {
  it('sums amountTWD across all purchases from all credit records', () => {
    const result = buildOverview({
      spendByDate: {},
      dates: [],
      cap: 15000000,
      creditRecords: [
        credit('a@x.com', 20, 0, [{ id: 'p1', credits: 20, amountTWD: 299, createdAt: '2026-08-01T00:00:00Z' }]),
        credit('b@x.com', 50, 10, [{ id: 'p2', credits: 50, amountTWD: 599, createdAt: '2026-08-02T00:00:00Z' }]),
      ],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.revenue.totalTWD).toBe(898);
  });

  it('admin grants (amountTWD=0) contribute 0 to revenue but still appear in the purchase list', () => {
    const result = buildOverview({
      spendByDate: {},
      dates: [],
      cap: 15000000,
      creditRecords: [
        credit('a@x.com', 10, 0, [{ id: 'grant1', credits: 10, amountTWD: 0, createdAt: '2026-08-01T00:00:00Z', provider: 'admin' }]),
      ],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.revenue.totalTWD).toBe(0);
    expect(result.revenue.purchases).toHaveLength(1);
  });

  it('purchase list is tagged with the owning email and sorted newest first', () => {
    const result = buildOverview({
      spendByDate: {},
      dates: [],
      cap: 15000000,
      creditRecords: [
        credit('old@x.com', 20, 0, [{ id: 'p1', credits: 20, amountTWD: 299, createdAt: '2026-08-01T00:00:00Z' }]),
        credit('new@x.com', 50, 0, [{ id: 'p2', credits: 50, amountTWD: 599, createdAt: '2026-08-02T00:00:00Z' }]),
      ],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.revenue.purchases.map(p => p.email)).toEqual(['new@x.com', 'old@x.com']);
  });

  it('no credit records at all yields zero revenue and an empty purchase list', () => {
    const result = buildOverview({
      spendByDate: {},
      dates: [],
      cap: 15000000,
      creditRecords: [],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.revenue.totalTWD).toBe(0);
    expect(result.revenue.purchases).toEqual([]);
  });
});

describe('buildOverview — totals', () => {
  it('payingUsers counts only credit records with total > 0', () => {
    const result = buildOverview({
      spendByDate: {},
      dates: [],
      cap: 15000000,
      creditRecords: [credit('paid@x.com', 20, 5), credit('zero@x.com', 0, 0)],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.totals.payingUsers).toBe(1);
  });

  it('passes verifiedCount and freeCount through unchanged', () => {
    const result = buildOverview({
      spendByDate: {},
      dates: [],
      cap: 15000000,
      creditRecords: [],
      verifiedCount: 7,
      freeCount: 3,
      jobStatuses: [],
    });
    expect(result.totals.verifiedUsers).toBe(7);
    expect(result.totals.freeUsers).toBe(3);
  });

  it('tallies jobsByStatus and totalJobs from the raw status list', () => {
    const result = buildOverview({
      spendByDate: {},
      dates: [],
      cap: 15000000,
      creditRecords: [],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: ['complete', 'complete', 'error', 'processing'],
    });
    expect(result.totals.jobsByStatus).toEqual({ complete: 2, error: 1, processing: 1 });
    expect(result.totals.totalJobs).toBe(4);
  });

  it('empty jobStatuses yields an empty jobsByStatus map and 0 totalJobs', () => {
    const result = buildOverview({
      spendByDate: {},
      dates: [],
      cap: 15000000,
      creditRecords: [],
      verifiedCount: 0,
      freeCount: 0,
      jobStatuses: [],
    });
    expect(result.totals.jobsByStatus).toEqual({});
    expect(result.totals.totalJobs).toBe(0);
  });
});
