export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { kvGet } from '@/lib/kv';
import { listKeysCapped } from '@/lib/admin-kv';
import { buildAdminJobRows } from '@/lib/admin-jobs';
import { captureError } from '@/lib/errors';
import { successResponse, errors } from '@/lib/api-response';
import { requireAdmin } from '@/lib/admin-auth';
import type { GenerationJob } from '@/types';

/**
 * GET /api/admin/jobs?email=xxx&adminEmail=yyy&email=<filter>
 * Recent generations feed, newest-first. `email` (the same param name the
 * companion admin routes use for auth) doubles as the optional per-user
 * filter — see `filterEmail` alias below to disambiguate from the admin's
 * own auth email.
 */
export async function GET(request: NextRequest) {
  const adminEmail = request.nextUrl.searchParams.get('adminEmail');
  const denied = requireAdmin(request, adminEmail);
  if (denied) return denied;

  const filterEmail = request.nextUrl.searchParams.get('email') || undefined;

  try {
    const { keys, truncated } = await listKeysCapped('job:');
    const jobs: GenerationJob[] = [];
    for (const key of keys) {
      const data = await kvGet(key);
      if (data) jobs.push(JSON.parse(data));
    }

    const rows = buildAdminJobRows(jobs, { emailFilter: filterEmail });

    return successResponse({ jobs: rows, truncated, generatedAt: new Date().toISOString() });
  } catch (error) {
    captureError(error, { route: '/api/admin/jobs' });
    return errors.serverError();
  }
}
