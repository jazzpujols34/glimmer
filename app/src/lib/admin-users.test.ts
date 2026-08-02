import { describe, it, expect } from 'vitest';
import { buildAdminUserRows } from './admin-users';
import type { CreditRecord } from '@/types';

function creditRecord(total: number, used: number, purchases: CreditRecord['purchases'] = []): CreditRecord {
  return { total, used, purchases };
}

describe('buildAdminUserRows', () => {
  it('joins credits + free + verified + job data for a single email', () => {
    const rows = buildAdminUserRows({
      creditRecords: { 'a@x.com': creditRecord(20, 5, [{ id: 'p1', credits: 20, amountTWD: 299, createdAt: '2026-08-01T00:00:00Z' }]) },
      freeUsed: { 'a@x.com': 2 },
      verifiedEmails: new Set(['a@x.com']),
      jobs: [
        { email: 'a@x.com', createdAt: '2026-08-01T00:00:00Z' },
        { email: 'a@x.com', createdAt: '2026-08-02T00:00:00Z' },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      email: 'a@x.com',
      verified: true,
      paidTotal: 20,
      paidUsed: 5,
      paidRemaining: 15,
      freeUsed: 2,
      purchases: [{ id: 'p1', credits: 20, amountTWD: 299, createdAt: '2026-08-01T00:00:00Z' }],
      lastJobAt: '2026-08-02T00:00:00Z',
      jobCount: 2,
    });
  });

  it('unions emails from all four sources — a user with only a job (no purchase, no free record) still appears', () => {
    const rows = buildAdminUserRows({
      creditRecords: {},
      freeUsed: {},
      verifiedEmails: new Set(),
      jobs: [{ email: 'onlyjob@x.com', createdAt: '2026-08-01T00:00:00Z' }],
    });
    expect(rows.map(r => r.email)).toEqual(['onlyjob@x.com']);
    expect(rows[0].paidTotal).toBe(0);
    expect(rows[0].jobCount).toBe(1);
  });

  it('a paying user with no jobs gets lastJobAt=null and jobCount=0', () => {
    const rows = buildAdminUserRows({
      creditRecords: { 'payer@x.com': creditRecord(20, 0) },
      freeUsed: {},
      verifiedEmails: new Set(),
      jobs: [],
    });
    expect(rows[0].lastJobAt).toBeNull();
    expect(rows[0].jobCount).toBe(0);
  });

  it('picks the newest createdAt as lastJobAt regardless of input order', () => {
    const rows = buildAdminUserRows({
      creditRecords: {},
      freeUsed: {},
      verifiedEmails: new Set(),
      jobs: [
        { email: 'x@x.com', createdAt: '2026-08-05T00:00:00Z' },
        { email: 'x@x.com', createdAt: '2026-08-01T00:00:00Z' },
        { email: 'x@x.com', createdAt: '2026-08-03T00:00:00Z' },
      ],
    });
    expect(rows[0].lastJobAt).toBe('2026-08-05T00:00:00Z');
    expect(rows[0].jobCount).toBe(3);
  });

  it('jobs without an email are ignored (never create an "undefined" row)', () => {
    const rows = buildAdminUserRows({
      creditRecords: {},
      freeUsed: {},
      verifiedEmails: new Set(),
      jobs: [{ email: undefined, createdAt: '2026-08-01T00:00:00Z' }],
    });
    expect(rows).toEqual([]);
  });

  it('email matching is case-insensitive against the job email field', () => {
    const rows = buildAdminUserRows({
      creditRecords: { 'mixed@x.com': creditRecord(10, 0) },
      freeUsed: {},
      verifiedEmails: new Set(),
      jobs: [{ email: 'MIXED@X.COM', createdAt: '2026-08-01T00:00:00Z' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].jobCount).toBe(1);
  });

  it('rows are sorted by lastJobAt descending, with null-lastJobAt rows last', () => {
    const rows = buildAdminUserRows({
      creditRecords: {
        'never@x.com': creditRecord(5, 0),
      },
      freeUsed: {},
      verifiedEmails: new Set(),
      jobs: [
        { email: 'old@x.com', createdAt: '2026-08-01T00:00:00Z' },
        { email: 'new@x.com', createdAt: '2026-08-05T00:00:00Z' },
      ],
    });
    expect(rows.map(r => r.email)).toEqual(['new@x.com', 'old@x.com', 'never@x.com']);
  });

  it('no data anywhere yields an empty list', () => {
    const rows = buildAdminUserRows({ creditRecords: {}, freeUsed: {}, verifiedEmails: new Set(), jobs: [] });
    expect(rows).toEqual([]);
  });
});
