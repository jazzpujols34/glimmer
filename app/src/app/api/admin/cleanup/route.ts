export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { kvListKeys, kvGet, kvDelete } from '@/lib/kv';
import { captureError } from '@/lib/errors';
import type { GenerationJob } from '@/types';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'glimmer.hello@gmail.com,aipujol34@gmail.com,cocoshell8988@gmail.com')
  .split(',')
  .map(e => e.toLowerCase().trim())
  .filter(Boolean);

function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

/**
 * Check if a video URL is expired (CDN URLs that are no longer accessible)
 */
async function isVideoExpired(url: string): Promise<boolean> {
  if (!url) return true;
  // R2 keys (not starting with http) are proxied and should work
  if (!url.startsWith('http')) return false;

  try {
    const res = await fetch(url, { method: 'HEAD' });
    return !res.ok;
  } catch {
    return true;
  }
}

/**
 * POST /api/admin/cleanup
 * Delete all jobs with expired video URLs
 * Body: { adminEmail, dryRun?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminEmail, dryRun = false } = body;

    if (!adminEmail || !isAdmin(adminEmail)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jobKeys = await kvListKeys('job:');
    const expiredJobs: { id: string; name?: string; videoUrl?: string; createdAt: string }[] = [];
    const validJobs: string[] = [];

    for (const key of jobKeys) {
      const data = await kvGet(key);
      if (!data) continue;

      const job = JSON.parse(data) as GenerationJob;

      // Skip non-complete jobs
      if (job.status !== 'complete') continue;

      // Check if video is expired
      const videoUrl = job.videoUrl || job.videoUrls?.[0];
      const expired = await isVideoExpired(videoUrl || '');

      if (expired) {
        expiredJobs.push({
          id: job.id,
          name: job.name,
          videoUrl,
          createdAt: job.createdAt,
        });

        if (!dryRun) {
          await kvDelete(key);
        }
      } else {
        validJobs.push(job.id);
      }
    }

    return NextResponse.json({
      dryRun,
      expiredCount: expiredJobs.length,
      validCount: validJobs.length,
      expiredJobs: expiredJobs.slice(0, 50), // Limit response size
      message: dryRun
        ? `Found ${expiredJobs.length} expired jobs (dry run, nothing deleted)`
        : `Deleted ${expiredJobs.length} expired jobs`,
    });
  } catch (error) {
    captureError(error, { route: '/api/admin/cleanup' });
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
