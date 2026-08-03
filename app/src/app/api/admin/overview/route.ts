export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { kvGet } from '@/lib/kv';
import { listKeysCapped, mapWithConcurrency } from '@/lib/admin-kv';
import { dailyTokenCap } from '@/lib/spend-guard';
import { buildOverview } from '@/lib/admin-overview';
import { buildAdminJobRows } from '@/lib/admin-jobs';
import { captureError } from '@/lib/errors';
import { successResponse, errors } from '@/lib/api-response';
import { requireAdmin } from '@/lib/admin-auth';
import type { CreditRecord, GenerationJob } from '@/types';

const SPEND_WINDOW_DAYS = 15; // today + last 14 days

/**
 * GET /api/admin/overview?email=<admin>&jobsEmail=<optional filter>
 *
 * Serves the 總覽 tab (spend/revenue/totals via admin-overview.ts) AND the
 * 生成紀錄 tab feed (via admin-jobs.ts) in one payload. Deliberately merged
 * into one route/one edge function rather than two: each Cloudflare Pages
 * Function built by @cloudflare/next-on-pages carries a ~320-330 KiB fixed
 * bundle overhead regardless of route logic size (verified empirically —
 * even a near-empty route like /api/webhooks/ecpay-return is ~312 KiB), and
 * the prod worker only has ~190 KiB of headroom under the 25.0 MiB deploy
 * gate. A second brand-new route was not affordable; a second query mode on
 * this one is free. `/api/admin/stats` (superseded — its data folds into
 * this response) was deleted for the same reason, netting the new route's
 * function-count cost back to zero.
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email');
  const denied = requireAdmin(request, email);
  if (denied) return denied;

  const jobsEmailFilter = request.nextUrl.searchParams.get('jobsEmail') || undefined;

  try {
    const dates = lastNDatesUTC(SPEND_WINDOW_DAYS);
    const spendByDate: Record<string, number> = {};
    await Promise.all(
      dates.map(async (date) => {
        const raw = await kvGet(`spend:${date}`);
        const parsed = raw ? Number(raw) : 0;
        spendByDate[date] = Number.isFinite(parsed) ? parsed : 0;
      })
    );

    const cap = dailyTokenCap();

    const [creditsList, verifiedList, freeList, jobsList] = await Promise.all([
      listKeysCapped('credits:'),
      listKeysCapped('verified:'),
      listKeysCapped('free:'),
      listKeysCapped('job:'),
    ]);

    // Hydrate the three key sets concurrently — see mapWithConcurrency's note:
    // reading these in series cost one edge round-trip per key and was the
    // dashboard's whole perceived load time.
    const [creditValues, verifiedValues, jobValues] = await Promise.all([
      mapWithConcurrency(creditsList.keys, (key) => kvGet(key)),
      mapWithConcurrency(verifiedList.keys, (key) => kvGet(key)),
      mapWithConcurrency(jobsList.keys, (key) => kvGet(key)),
    ]);

    const creditRecords: { email: string; record: CreditRecord }[] = creditsList.keys.flatMap(
      (key, i) => {
        const data = creditValues[i];
        return data
          ? [{ email: key.replace('credits:', ''), record: JSON.parse(data) as CreditRecord }]
          : [];
      },
    );

    const verifiedCount = verifiedValues.filter((data) => data === 'true').length;

    const jobs: GenerationJob[] = jobValues.flatMap((data) =>
      data ? [JSON.parse(data) as GenerationJob] : [],
    );

    const overview = buildOverview({
      spendByDate,
      dates,
      cap,
      creditRecords,
      verifiedCount,
      freeCount: freeList.keys.length,
      jobStatuses: jobs.map((j) => j.status),
    });

    const jobRows = buildAdminJobRows(jobs, { emailFilter: jobsEmailFilter });

    return successResponse({
      ...overview,
      jobs: jobRows,
      truncated: creditsList.truncated || verifiedList.truncated || freeList.truncated || jobsList.truncated,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    captureError(error, { route: '/api/admin/overview' });
    return errors.serverError();
  }
}

/** Chronological (oldest -> newest) UTC date strings, last entry is today. */
function lastNDatesUTC(n: number): string[] {
  const now = new Date();
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
