export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { kvGet, kvListKeys } from '@/lib/kv';
import { setJobComplete, setJobError, updateJob } from '@/lib/storage';
import { checkVideoTaskStatus } from '@/lib/veo';
import { archiveVideos } from '@/lib/r2';
import { checkCredits } from '@/lib/credits';
import { sendCompletionEmail } from '@/lib/email';
import { captureError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { errors as apiErrors } from '@/lib/api-response';
import { getRequesterEmail, ownsOrAdmin } from '@/lib/owner';
import type { GenerationJob } from '@/types';

/**
 * POST /api/gallery/refresh
 * Bulk-refresh all processing jobs by polling their external provider status.
 * This triggers the same logic as /api/status/[id] but for all pending jobs.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: this route polls external providers for every processing job
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`gallery-refresh:${ip}`, 5, 300);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return apiErrors.rateLimited(retryAfter);
    }

    const requesterEmail = getRequesterEmail(request);
    if (!requesterEmail) {
      return new URL(request.url).searchParams.get('email')
        ? apiErrors.invalidEmail()
        : apiErrors.missingField('email');
    }

    // List all job keys
    const keys = await kvListKeys('job:');

    let checked = 0;
    let updated = 0;
    let errors = 0;
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
            errors++;
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
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      checked,
      updated,
      errors,
      updatedJobIds,
    });
  } catch (error) {
    captureError(error, { route: '/api/gallery/refresh' });
    return NextResponse.json(
      { error: '刷新失敗' },
      { status: 500 }
    );
  }
}
