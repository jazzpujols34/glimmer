/**
 * The one place a generation job moves out of `processing`.
 *
 * Every polling route (status/[id], batch-status, POST /api/gallery) calls
 * settleJob instead of carrying its own copy of "ask the provider, archive,
 * store, notify". Server-only: it pulls in the provider SDK through veo.ts, so
 * client code and light routes import lib/lifecycle.ts instead.
 */
import type { GenerationJob } from '@/types';
import { checkVideoTaskStatus } from './veo';
import { archiveVideos } from './r2';
import { checkCredits } from './credits';
import { sendCompletionEmail } from './email';
import { getJob, updateJob, setJobComplete, setJobError } from './storage';
import { captureError, normalizeError } from './errors';
import { logger } from './logger';

/**
 * Asks the provider once and applies the result. Returns the stored record,
 * which may differ from what this call wanted if another poll got there first.
 */
export async function settleJob(job: GenerationJob, opts?: { batchName?: string }): Promise<GenerationJob> {
  if (job.status !== 'processing' || !job.provider) return job;

  let result;
  try {
    result = await checkVideoTaskStatus(job);
  } catch (err) {
    // Not being able to ask is not an answer — the job is still running.
    captureError(err, { route: 'settleJob', jobId: job.id });
    return job;
  }

  if (result.done && result.error) {
    return (await setJobError(job.id, normalizeError(result.error))) ?? job;
  }

  if (result.done && result.videoUrls?.length) {
    const archive = await archiveVideos(job.id, result.videoUrls);

    // Paid users get the 30-day record lifetime; free users get 24h
    let paidUser = false;
    if (job.email) {
      try {
        paidUser = (await checkCredits(job.email)).paidTotal > 0;
      } catch {
        // Non-critical — default to the free lifetime
      }
    }

    // Re-read so a poll that lost the race neither overwrites nor re-notifies.
    const current = await getJob(job.id);
    if (current && current.status !== 'processing') return current;

    const stored = await setJobComplete(job.id, archive.urls[0], archive.urls, {
      paidUser,
      archived: archive.archived,
    });
    notifyCompletion(job, opts?.batchName);
    return stored ?? job;
  }

  if (!result.done && result.progress) {
    return (await updateJob(job.id, { progress: result.progress })) ?? job;
  }
  return job;
}

/** One email per piece of work: per job, or once per batch on its first segment. */
function notifyCompletion(job: GenerationJob, batchName?: string): void {
  if (!job.email) return;
  if (job.batchId && job.segmentIndex !== 0) return;
  const id = job.batchId ?? job.id;
  const name = (job.batchId && batchName) || job.name || '';
  sendCompletionEmail(job.email, id, name).catch(err =>
    logger.error(`[Email] Completion notification failed for ${id}:`, err)
  );
}

/**
 * Provider links expire in 24h. A finished job whose archive attempt failed
 * gets another try each time someone looks at it.
 */
export async function archiveIfNeeded(job: GenerationJob): Promise<GenerationJob> {
  if (job.status !== 'complete' || job.archived || !job.videoUrls?.some(u => u.startsWith('http'))) {
    return job;
  }
  try {
    const archive = await archiveVideos(job.id, job.videoUrls);
    if (!archive.archived) return job;
    const stored = await updateJob(job.id, {
      videoUrls: archive.urls,
      videoUrl: archive.urls[0],
      archived: true,
    });
    return stored ?? job;
  } catch (err) {
    logger.error(`[R2] Archival retry failed for job ${job.id}:`, err);
    return job;
  }
}
