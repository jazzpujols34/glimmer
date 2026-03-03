export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { getCreditRecord } from '@/lib/credits';
import { successResponse } from '@/lib/api-response';

/**
 * Check if user has paid access (for feature gating)
 * Returns: { hasPaidAccess: boolean, isAdmin: boolean }
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email');

  if (!email) {
    return successResponse({ hasPaidAccess: false, isAdmin: false });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if admin (default admin emails match credits.ts)
  const adminEmails = (process.env.ADMIN_EMAILS || 'glimmer.hello@gmail.com,aipujol34@gmail.com,cocoshell8988@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin = adminEmails.includes(normalizedEmail);

  // Admins always have access
  if (isAdmin) {
    return successResponse({ hasPaidAccess: true, isAdmin: true });
  }

  // Check if user has ever paid (total > 0 means they purchased credits)
  const record = await getCreditRecord(normalizedEmail);
  const hasPaidAccess = (record?.total || 0) > 0;

  return successResponse({ hasPaidAccess, isAdmin: false });
}
