export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getCompletedJobs } from '@/lib/storage';
import { settleJob, archiveIfNeeded } from '@/lib/job-settle';
import { captureError } from '@/lib/errors';
import { getVideoUrl, getVideoUrls } from '@/lib/video-url';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { errors } from '@/lib/api-response';
import { resolveReaderEmail } from '@/lib/identity';
import { isAdmin } from '@/lib/credits';
import { kvGet, kvListKeys } from '@/lib/kv';
import { ownsOrAdmin } from '@/lib/owner';
import type { GenerationJob } from '@/types';

export async function GET(request: NextRequest) {
  try {
    // Rate limit: this route does a full KV scan + R2 archival retries on every call
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`gallery:${ip}`, 30, 60);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return errors.rateLimited(retryAfter);
    }

    const resolved = await resolveReaderEmail(request);
    if ('error' in resolved) {
      if (resolved.error === 'SESSION_REQUIRED') return errors.sessionRequired();
      return resolved.error === 'INVALID' ? errors.invalidEmail() : errors.missingField('email');
    }
    const requesterEmail = resolved.email;

    // Admins see every job; everyone else only sees their own
    // Retry archival for any unarchived jobs (CDN URLs expire in 24h)
    const found = await getCompletedJobs(isAdmin(requesterEmail) ? undefined : requesterEmail);
    const jobs: GenerationJob[] = [];
    for (const job of found) jobs.push(await archiveIfNeeded(job));

    return NextResponse.json({
      jobs: jobs.map(job => ({
        id: job.id,
        name: job.name || '未命名',
        occasion: job.occasion || 'other',
        videoUrl: getVideoUrl(job.id, job.videoUrl, 0),
        videoUrls: getVideoUrls(job.id, job.videoUrls),
        createdAt: job.createdAt,
        favorite: job.favorite,
        projectId: job.projectId,
        settings: job.settings ? {
          model: job.settings.model,
          aspectRatio: job.settings.aspectRatio,
          videoLength: job.settings.videoLength,
          resolution: job.settings.resolution,
        } : undefined,
      })),
    });
  } catch (error) {
    captureError(error, { route: '/api/gallery' });
    return NextResponse.json(
      { error: '無法載入影片庫' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/gallery — bulk-refresh this user's still-processing jobs by
 * polling their provider status (the same work /api/status/[id] does for one
 * job).
 *
 * Folded in from its own /api/gallery/refresh route rather than living
 * separately: each Cloudflare Pages Function carries a fixed ~320 KiB bundle
 * overhead regardless of its logic, this one built to 583 KiB, and the app
 * sits hard against the 25 MiB Functions deploy limit — adding read
 * enforcement pushed the build over and Cloudflare rejected it outright.
 * Same file means same function, so this costs only its marginal imports.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: this route polls external providers for every processing job
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`gallery-refresh:${ip}`, 5, 300);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return errors.rateLimited(retryAfter);
    }

    const resolved = await resolveReaderEmail(request);
    if ('error' in resolved) {
      if (resolved.error === 'SESSION_REQUIRED') return errors.sessionRequired();
      return resolved.error === 'INVALID' ? errors.invalidEmail() : errors.missingField('email');
    }
    const requesterEmail = resolved.email;

    // List all job keys
    const keys = await kvListKeys('job:');

    let checked = 0;
    let updated = 0;
    let failed = 0;
    const updatedJobIds: string[] = [];

    // Check each job
    for (const key of keys) {
      const data = await kvGet(key);
      if (!data) continue;

      const job: GenerationJob = JSON.parse(data);

      // Only check jobs that are still processing, and only this user's own jobs (admins: all)
      if (job.status !== 'processing' || !job.provider) continue;
      if (!ownsOrAdmin(job.email, requesterEmail)) continue;

      checked++;

      const settled = await settleJob(job);
      if (settled.status === 'complete') {
        updated++;
        updatedJobIds.push(job.id);
      } else if (settled.status === 'error') {
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      checked,
      updated,
      errors: failed,
      updatedJobIds,
    });
  } catch (error) {
    captureError(error, { route: 'POST /api/gallery' });
    return NextResponse.json(
      { error: '刷新失敗' },
      { status: 500 }
    );
  }
}
