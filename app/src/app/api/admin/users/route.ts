export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { kvListKeys, kvGet, kvPut } from '@/lib/kv';
import { listKeysCapped, mapWithConcurrency } from '@/lib/admin-kv';
import { getCreditRecord, checkCredits, isAdmin, getFreeRecord } from '@/lib/credits';
import { buildAdminUserRows } from '@/lib/admin-users';
import { captureError } from '@/lib/errors';
import { successResponse, errors } from '@/lib/api-response';
import { requireAdmin } from '@/lib/admin-auth';
import type { GenerationJob, CreditRecord } from '@/types';

/**
 * GET /api/admin/users?adminEmail=yyy               -> list all users (Task 2 row shape)
 * GET /api/admin/users?email=xxx&adminEmail=yyy      -> single-user deep lookup (unchanged)
 */
export async function GET(request: NextRequest) {
  const adminEmail = request.nextUrl.searchParams.get('adminEmail');
  const userEmail = request.nextUrl.searchParams.get('email');

  const denied = requireAdmin(request, adminEmail);
  if (denied) return denied;

  if (!userEmail) {
    return getUsersList();
  }

  const normalizedEmail = userEmail.toLowerCase().trim();

  try {
    // Get credit record
    const creditRecord = await getCreditRecord(normalizedEmail);
    const creditBalance = await checkCredits(normalizedEmail);

    // Get user's jobs
    const jobKeys = await kvListKeys('job:');
    const jobValues = await mapWithConcurrency(jobKeys, (key) => kvGet(key));
    const userJobs: GenerationJob[] = jobValues.flatMap((data) => {
      if (!data) return [];
      const job = JSON.parse(data) as GenerationJob;
      return job.email?.toLowerCase() === normalizedEmail ? [job] : [];
    });

    // Sort jobs by date (newest first)
    userJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Check if user is admin
    const userIsAdmin = isAdmin(normalizedEmail);

    return successResponse({
      email: normalizedEmail,
      isAdmin: userIsAdmin,
      credits: creditBalance,
      creditRecord: creditRecord || { total: 0, used: 0, purchases: [] },
      jobs: userJobs.slice(0, 50), // Limit to 50 most recent
      totalJobs: userJobs.length,
    });
  } catch (error) {
    captureError(error, { route: '/api/admin/users', userEmail: normalizedEmail });
    return errors.serverError();
  }
}

/**
 * List all users as per-email rows (credits + free tier + verified + last
 * job), for the admin dashboard's 用戶 table. Task 2.
 */
async function getUsersList() {
  try {
    const [creditsList, freeList, verifiedList, jobsList] = await Promise.all([
      listKeysCapped('credits:'),
      listKeysCapped('free:'),
      listKeysCapped('verified:'),
      listKeysCapped('job:'),
    ]);

    // All four key sets hydrate concurrently — in series this was one edge
    // round-trip per key and dominated the dashboard's load time.
    // Free-tier usage MUST go through credits.ts's getFreeRecord — it holds the
    // boolean->number migration for legacy records; never reparse raw here.
    const [creditValues, freeRecords, verifiedValues, jobValues] = await Promise.all([
      mapWithConcurrency(creditsList.keys, (key) => kvGet(key)),
      mapWithConcurrency(freeList.keys, (key) => getFreeRecord(key.replace('free:', ''))),
      mapWithConcurrency(verifiedList.keys, (key) => kvGet(key)),
      mapWithConcurrency(jobsList.keys, (key) => kvGet(key)),
    ]);

    const creditRecords: Record<string, CreditRecord> = {};
    creditsList.keys.forEach((key, i) => {
      const data = creditValues[i];
      if (data) creditRecords[key.replace('credits:', '')] = JSON.parse(data);
    });

    const freeUsed: Record<string, number> = {};
    freeList.keys.forEach((key, i) => {
      freeUsed[key.replace('free:', '')] = freeRecords[i].used;
    });

    const verifiedEmails = new Set<string>();
    verifiedList.keys.forEach((key, i) => {
      if (verifiedValues[i] === 'true') verifiedEmails.add(key.replace('verified:', ''));
    });

    const jobs: { email?: string; createdAt: string }[] = jobValues.flatMap((data) => {
      if (!data) return [];
      const job = JSON.parse(data) as GenerationJob;
      return [{ email: job.email, createdAt: job.createdAt }];
    });

    const users = buildAdminUserRows({ creditRecords, freeUsed, verifiedEmails, jobs });
    const truncated = creditsList.truncated || freeList.truncated || verifiedList.truncated || jobsList.truncated;

    return successResponse({ users, truncated, generatedAt: new Date().toISOString() });
  } catch (error) {
    captureError(error, { route: '/api/admin/users (list)' });
    return errors.serverError();
  }
}

/**
 * POST /api/admin/users
 * Grant credits to a user
 * Body: { adminEmail, userEmail, credits, reason }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminEmail, userEmail, credits, reason } = body;

    const denied = requireAdmin(request, adminEmail);
    if (denied) return denied;

    if (!userEmail || typeof credits !== 'number' || credits <= 0) {
      return errors.invalidInput('Invalid request: userEmail and credits required');
    }

    const normalizedEmail = userEmail.toLowerCase().trim();

    // Get current credit record
    const key = `credits:${normalizedEmail}`;
    const existing = await kvGet(key);
    const record: CreditRecord = existing
      ? JSON.parse(existing)
      : { total: 0, used: 0, purchases: [] };

    // Add admin grant as a "purchase"
    const grantId = `ADMIN-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    record.total += credits;
    record.purchases.push({
      id: grantId,
      credits,
      amountTWD: 0, // Admin grants are free
      createdAt: new Date().toISOString(),
      provider: 'admin',
      adminGrantedBy: adminEmail,
      adminReason: reason || 'Admin grant',
    });

    // Save updated record
    await kvPut(key, JSON.stringify(record));

    return successResponse({
      grantId,
      newTotal: record.total,
      newRemaining: record.total - record.used,
    });
  } catch (error) {
    captureError(error, { route: '/api/admin/users POST' });
    return errors.serverError();
  }
}
