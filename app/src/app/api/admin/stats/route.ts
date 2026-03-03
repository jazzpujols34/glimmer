export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { kvListKeys, kvGet } from '@/lib/kv';
import { captureError } from '@/lib/errors';
import { successResponse, errorResponse, errors } from '@/lib/api-response';
import type { GenerationJob, CreditRecord } from '@/types';

// Admin emails - same as in credits.ts
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'glimmer.hello@gmail.com,aipujol34@gmail.com,cocoshell8988@gmail.com')
  .split(',')
  .map(e => e.toLowerCase().trim())
  .filter(Boolean);

function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export async function GET(request: NextRequest) {
  // Check admin auth via query param
  const email = request.nextUrl.searchParams.get('email');
  if (!email || !isAdmin(email)) {
    return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');
  }

  try {
    // Get all jobs
    const jobKeys = await kvListKeys('job:');
    const jobs: GenerationJob[] = [];
    for (const key of jobKeys) {
      const data = await kvGet(key);
      if (data) jobs.push(JSON.parse(data));
    }

    // Get all credit records
    const creditKeys = await kvListKeys('credits:');
    const credits: { email: string; record: CreditRecord }[] = [];
    for (const key of creditKeys) {
      const data = await kvGet(key);
      if (data) {
        credits.push({
          email: key.replace('credits:', ''),
          record: JSON.parse(data),
        });
      }
    }

    // Calculate stats
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Job stats
    const totalJobs = jobs.length;
    const completedJobs = jobs.filter(j => j.status === 'complete').length;
    const errorJobs = jobs.filter(j => j.status === 'error').length;
    const processingJobs = jobs.filter(j => j.status === 'processing').length;

    const jobsToday = jobs.filter(j => new Date(j.createdAt) >= today).length;
    const jobsThisWeek = jobs.filter(j => new Date(j.createdAt) >= thisWeek).length;
    const jobsThisMonth = jobs.filter(j => new Date(j.createdAt) >= thisMonth).length;

    // Model usage
    const modelUsage: Record<string, number> = {};
    jobs.forEach(job => {
      const model = job.settings?.model || 'unknown';
      modelUsage[model] = (modelUsage[model] || 0) + 1;
    });

    // Occasion usage
    const occasionUsage: Record<string, number> = {};
    jobs.forEach(job => {
      const occasion = job.occasion || 'unknown';
      occasionUsage[occasion] = (occasionUsage[occasion] || 0) + 1;
    });

    // Credit stats
    const totalPaidCredits = credits.reduce((sum, c) => sum + c.record.total, 0);
    const totalUsedCredits = credits.reduce((sum, c) => sum + c.record.used, 0);
    const totalPurchases = credits.reduce((sum, c) => sum + c.record.purchases.length, 0);
    const totalRevenue = credits.reduce((sum, c) =>
      sum + c.record.purchases.reduce((ps, p) => ps + (p.amountTWD || 0), 0), 0
    );

    // Recent purchases (last 10)
    const allPurchases = credits.flatMap(c =>
      c.record.purchases.map(p => ({ ...p, email: c.email }))
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

    // Recent jobs (last 20)
    const recentJobs = jobs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20)
      .map(j => ({
        id: j.id,
        name: j.name,
        status: j.status,
        occasion: j.occasion,
        model: j.settings?.model,
        email: j.email,
        createdAt: j.createdAt,
        error: j.error,
      }));

    // Unique emails
    const uniqueEmails = new Set([
      ...jobs.filter(j => j.email).map(j => j.email!.toLowerCase()),
      ...credits.map(c => c.email.toLowerCase()),
    ]).size;

    return successResponse({
      jobs: {
        total: totalJobs,
        completed: completedJobs,
        error: errorJobs,
        processing: processingJobs,
        today: jobsToday,
        thisWeek: jobsThisWeek,
        thisMonth: jobsThisMonth,
      },
      models: modelUsage,
      occasions: occasionUsage,
      credits: {
        totalPaid: totalPaidCredits,
        totalUsed: totalUsedCredits,
        totalPurchases,
        totalRevenue,
      },
      users: {
        unique: uniqueEmails,
        paying: credits.filter(c => c.record.total > 0).length,
      },
      recentPurchases: allPurchases,
      recentJobs,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    captureError(error, { route: '/api/admin/stats' });
    return errors.serverError();
  }
}
