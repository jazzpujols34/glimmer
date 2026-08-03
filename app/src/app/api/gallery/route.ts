export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getCompletedJobs, updateJob, setJobComplete, setJobError } from '@/lib/storage';
import { archiveVideos } from '@/lib/r2';
import { captureError } from '@/lib/errors';
import { getVideoUrl, getVideoUrls } from '@/lib/video-url';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { errors } from '@/lib/api-response';
import { resolveReaderEmail } from '@/lib/identity';
import { isAdmin, checkCredits } from '@/lib/credits';
import { kvGet, kvListKeys } from '@/lib/kv';
import { checkVideoTaskStatus } from '@/lib/veo';
import { sendCompletionEmail } from '@/lib/email';
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
    const jobs = await getCompletedJobs(isAdmin(requesterEmail) ? undefined : requesterEmail);

    // Retry archival for any unarchived jobs (CDN URLs expire in 24h)
    for (const job of jobs) {
      if (!job.archived && job.videoUrls?.some(u => u.startsWith('http'))) {
        try {
          const archive = await archiveVideos(job.id, job.videoUrls);
          if (archive.archived) {
            await updateJob(job.id, {
              videoUrls: archive.urls,
              videoUrl: archive.urls[0],
              archived: true,
            });
            job.videoUrls = archive.urls;
            job.videoUrl = archive.urls[0];
            job.archived = true;
            logger.debug('R2', `Gallery: archived job ${job.id} on retry`);
          }
        } catch {
          // Non-blocking — still return the CDN URLs
        }
      }
    }

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

      try {
        const result = await checkVideoTaskStatus(job);

        if (result.done) {
          if (result.error) {
            await setJobError(job.id, result.error);
            failed++;
          } else if (result.videoUrls && result.videoUrls.length > 0) {
            // Archive videos to R2
            const archive = await archiveVideos(job.id, result.videoUrls);
            const finalUrls = archive.urls;

            // Check if paid user for TTL
            let paidUser = false;
            if (job.email) {
              try {
                const balance = await checkCredits(job.email);
                paidUser = balance.paidTotal > 0;
              } catch {
                // Non-critical
              }
            }

            await setJobComplete(job.id, finalUrls[0], finalUrls, {
              paidUser,
              archived: archive.archived,
            });

            // Send completion email (fire-and-forget)
            if (job.email) {
              sendCompletionEmail(job.email, job.id, job.name || '').catch(err =>
                logger.error(`[Email] Completion notification failed for job ${job.id}:`, err)
              );
            }

            updated++;
            updatedJobIds.push(job.id);
          }
        } else if (result.progress) {
          // Update progress even if not done
          await updateJob(job.id, { progress: result.progress });
        }
      } catch (err) {
        logger.error(`[Refresh] Failed to check job ${job.id}:`, err);
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
