export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { getCreditRecord, isAdmin } from '@/lib/credits';
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

  if (isAdmin(normalizedEmail)) {
    return successResponse({ hasPaidAccess: true, isAdmin: true });
  }

  const record = await getCreditRecord(normalizedEmail);
  const hasPaidAccess = (record?.total || 0) > 0;

  return successResponse({ hasPaidAccess, isAdmin: false });
}
