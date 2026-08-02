export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { kvGet } from '@/lib/kv';
import { listKeysCapped } from '@/lib/admin-kv';
import { dailyTokenCap } from '@/lib/spend-guard';
import { buildOverview } from '@/lib/admin-overview';
import { captureError } from '@/lib/errors';
import { successResponse, errors } from '@/lib/api-response';
import { requireAdmin } from '@/lib/admin-auth';
import type { CreditRecord, GenerationJob } from '@/types';

const SPEND_WINDOW_DAYS = 15; // today + last 14 days

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

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email');
  const denied = requireAdmin(request, email);
  if (denied) return denied;

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

    const creditRecords: { email: string; record: CreditRecord }[] = [];
    for (const key of creditsList.keys) {
      const data = await kvGet(key);
      if (data) creditRecords.push({ email: key.replace('credits:', ''), record: JSON.parse(data) });
    }

    let verifiedCount = 0;
    for (const key of verifiedList.keys) {
      const data = await kvGet(key);
      if (data === 'true') verifiedCount++;
    }

    const jobStatuses: string[] = [];
    for (const key of jobsList.keys) {
      const data = await kvGet(key);
      if (data) {
        const job = JSON.parse(data) as GenerationJob;
        jobStatuses.push(job.status);
      }
    }

    const overview = buildOverview({
      spendByDate,
      dates,
      cap,
      creditRecords,
      verifiedCount,
      freeCount: freeList.keys.length,
      jobStatuses,
    });

    return successResponse({
      ...overview,
      truncated: creditsList.truncated || verifiedList.truncated || freeList.truncated || jobsList.truncated,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    captureError(error, { route: '/api/admin/overview' });
    return errors.serverError();
  }
}
