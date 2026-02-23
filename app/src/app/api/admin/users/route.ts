export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { kvListKeys, kvGet, kvPut } from '@/lib/kv';
import { getCreditRecord, checkCredits } from '@/lib/credits';
import { captureError } from '@/lib/errors';
import type { GenerationJob, CreditRecord, CreditBalance } from '@/types';

// Admin emails - same as in credits.ts
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'glimmer.hello@gmail.com,aipujol34@gmail.com,cocoshell8988@gmail.com')
  .split(',')
  .map(e => e.toLowerCase().trim())
  .filter(Boolean);

function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

/**
 * GET /api/admin/users?email=xxx&adminEmail=yyy
 * Look up a user by email, return their credits, purchases, and jobs
 */
export async function GET(request: NextRequest) {
  const adminEmail = request.nextUrl.searchParams.get('adminEmail');
  const userEmail = request.nextUrl.searchParams.get('email');

  if (!adminEmail || !isAdmin(adminEmail)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!userEmail) {
    return NextResponse.json({ error: 'User email required' }, { status: 400 });
  }

  const normalizedEmail = userEmail.toLowerCase().trim();

  try {
    // Get credit record
    const creditRecord = await getCreditRecord(normalizedEmail);
    const creditBalance = await checkCredits(normalizedEmail);

    // Get user's jobs
    const jobKeys = await kvListKeys('job:');
    const userJobs: GenerationJob[] = [];
    for (const key of jobKeys) {
      const data = await kvGet(key);
      if (data) {
        const job = JSON.parse(data) as GenerationJob;
        if (job.email?.toLowerCase() === normalizedEmail) {
          userJobs.push(job);
        }
      }
    }

    // Sort jobs by date (newest first)
    userJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Check if user is admin
    const userIsAdmin = isAdmin(normalizedEmail);

    return NextResponse.json({
      email: normalizedEmail,
      isAdmin: userIsAdmin,
      credits: creditBalance,
      creditRecord: creditRecord || { total: 0, used: 0, purchases: [] },
      jobs: userJobs.slice(0, 50), // Limit to 50 most recent
      totalJobs: userJobs.length,
    });
  } catch (error) {
    captureError(error, { route: '/api/admin/users', userEmail: normalizedEmail });
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
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

    if (!adminEmail || !isAdmin(adminEmail)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!userEmail || typeof credits !== 'number' || credits <= 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
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

    return NextResponse.json({
      success: true,
      grantId,
      newTotal: record.total,
      newRemaining: record.total - record.used,
    });
  } catch (error) {
    captureError(error, { route: '/api/admin/users POST' });
    return NextResponse.json({ error: 'Failed to grant credits' }, { status: 500 });
  }
}
