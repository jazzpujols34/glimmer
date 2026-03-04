export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { kvGet, kvListKeys } from '@/lib/kv';
import { getJob, setJobComplete, setJobError, updateJob } from '@/lib/storage';
import { checkVideoTaskStatus } from '@/lib/veo';
import { archiveVideos } from '@/lib/r2';
import { checkCredits } from '@/lib/credits';
import { sendCompletionEmail } from '@/lib/email';
import { captureError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { GenerationJob } from '@/types';

/**
 * POST /api/gallery/refresh
 * Bulk-refresh all processing jobs by polling their external provider status.
 * This triggers the same logic as /api/status/[id] but for all pending jobs.
 */
export async function POST() {
  try {
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

      // Only check jobs that are still processing
      if (job.status !== 'processing' || !job.provider) continue;

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
