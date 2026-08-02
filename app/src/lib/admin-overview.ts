/**
 * Pure aggregation for /api/admin/overview. Fed with plain records the route
 * has already fetched from KV — no KV access here, so this is trivially
 * unit-testable and the route stays a thin wrapper.
 */

import type { CreditRecord, PurchaseRecord } from '@/types';

const DEFAULT_USD_PER_MILLION_TOKENS = 1.2; // BytePlus price, confirmed from the bill

export interface SpendDayPoint {
  date: string;
  tokens: number;
  estCostUSD: number;
}

export interface OverviewSpend {
  days: SpendDayPoint[]; // chronological, oldest -> newest; last entry is today
  today: SpendDayPoint;
  cap: number; // 0 = disabled
  remaining: number | null; // null = uncapped
  capped: boolean;
}

export interface OverviewPurchase extends PurchaseRecord {
  email: string;
}

export interface OverviewRevenue {
  totalTWD: number;
  purchases: OverviewPurchase[]; // newest first
}

export interface OverviewTotals {
  payingUsers: number;
  verifiedUsers: number;
  freeUsers: number;
  jobsByStatus: Record<string, number>;
  totalJobs: number;
}

export interface OverviewResult {
  spend: OverviewSpend;
  revenue: OverviewRevenue;
  totals: OverviewTotals;
}

export interface BuildOverviewInput {
  spendByDate: Record<string, number>; // date -> tokens; missing dates treated as 0
  dates: string[]; // chronological oldest -> newest; last = today
  cap: number;
  creditRecords: { email: string; record: CreditRecord }[];
  verifiedCount: number;
  freeCount: number;
  jobStatuses: string[];
  usdPerMillionTokens?: number;
}

function toDayPoint(date: string, tokens: number, usdPerM: number): SpendDayPoint {
  return { date, tokens, estCostUSD: (tokens / 1_000_000) * usdPerM };
}

export function buildOverview(input: BuildOverviewInput): OverviewResult {
  const usdPerM = input.usdPerMillionTokens ?? DEFAULT_USD_PER_MILLION_TOKENS;

  const days = input.dates.map((date) => toDayPoint(date, input.spendByDate[date] ?? 0, usdPerM));
  const today = days.length > 0 ? days[days.length - 1] : toDayPoint('', 0, usdPerM);
  const capped = input.cap > 0 && today.tokens >= input.cap;
  const remaining = input.cap === 0 ? null : Math.max(0, input.cap - today.tokens);

  const purchases: OverviewPurchase[] = input.creditRecords
    .flatMap((c) => c.record.purchases.map((p) => ({ ...p, email: c.email })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalTWD = purchases.reduce((sum, p) => sum + (p.amountTWD || 0), 0);
  const payingUsers = input.creditRecords.filter((c) => c.record.total > 0).length;

  const jobsByStatus: Record<string, number> = {};
  for (const status of input.jobStatuses) {
    jobsByStatus[status] = (jobsByStatus[status] || 0) + 1;
  }

  return {
    spend: { days, today, cap: input.cap, remaining, capped },
    revenue: { totalTWD, purchases },
    totals: {
      payingUsers,
      verifiedUsers: input.verifiedCount,
      freeUsers: input.freeCount,
      jobsByStatus,
      totalJobs: input.jobStatuses.length,
    },
  };
}
