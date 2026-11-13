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
import { checkCredits, refundCredits } from './credits';
import { sendCompletionEmail } from './email';
import { getJob, updateJob, setJobComplete, setJobError } from './storage';
import { captureError, normalizeError } from './errors';
import { kvGet, kvPut } from './kv';
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
    result = { done: false };
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
      failedVideos: result.failedCount,
    });
    notifyCompletion(job, opts?.batchName);
    return stored ? refundIfOwed(stored) : job;
  }

  if (result.done) {
    return failJob(job, normalizeError(result.error ?? 'Generation failed'));
  }

  // Generation takes minutes. Hours of "still working" means the provider lost the task.
  if (Date.now() - new Date(job.createdAt).getTime() > STUCK_AFTER_MS) {
    return failJob(job, '系統處理逾時，請重新生成。');
  }

  if (result.progress) {
    return (await updateJob(job.id, { progress: result.progress })) ?? job;
  }
  return job;
}

const STUCK_AFTER_MS = 3 * 60 * 60 * 1000;

async function failJob(job: GenerationJob, message: string): Promise<GenerationJob> {
  const stored = (await setJobError(job.id, message)) ?? job;
  return refundIfOwed(stored);
}

// A falsely filtered family photo happens once or twice. More refunds than
// this in a day looks like failing on purpose, which costs us provider money.
const REFUNDS_PER_EMAIL_PER_DAY = 3;
const REFUNDS_PER_IP_PER_DAY = 5;

/**
 * Gives back what a failed job (or the failed share of a partly failed one)
 * was charged. The failure is the system's, so the customer should not pay.
 *
 * Safe to call on every look at a job: refundCredits applies a charge ref at
 * most once, and `refundedCredits` is written only after the refund is, so a
 * refund that could not be written is retried instead of being shown as done.
 */
export async function refundIfOwed(job: GenerationJob): Promise<GenerationJob> {
  if (!job.email || !job.charge || job.refundedCredits !== undefined || job.refundHeld) return job;

  let share: number;
  if (job.status === 'error') {
    share = 1;
  } else if (job.status === 'complete' && job.failedVideos) {
    share = job.failedVideos / (job.failedVideos + (job.videoUrls?.length ?? 0));
  } else {
    return job;
  }

  const paid = Math.ceil(job.charge.paid * share); // an uneven share rounds in the customer's favour
  const free = share === 1 ? job.charge.free : 0;  // more than one version is never paid from the free tier
  if (paid + free === 0) return job;

  try {
    const allowed =
      (await claimRefundSlot(`email:${job.email.toLowerCase()}`, job.charge.ref, REFUNDS_PER_EMAIL_PER_DAY)) &&
      (!job.ip || (await claimRefundSlot(`ip:${job.ip}`, job.charge.ref, REFUNDS_PER_IP_PER_DAY)));
    if (!allowed) {
      captureError(new Error(`Refund held for review: job ${job.id}, ${paid + free} credit(s)`), {
        route: 'refundIfOwed.held', jobId: job.id, email: job.email,
      });
      return (await updateJob(job.id, { refundHeld: true })) ?? job;
    }
    await refundCredits(job.email, job.charge.ref, free, paid);
  } catch (err) {
    captureError(err, { route: 'refundIfOwed', jobId: job.id, email: job.email });
    return job;
  }
  return (await updateJob(job.id, { refundedCredits: paid + free })) ?? job;
}

/** True if `ref` holds (or now takes) one of today's `max` refund slots for `scope`. */
async function claimRefundSlot(scope: string, ref: string, max: number): Promise<boolean> {
  const key = `refundcap:${scope}:${new Date().toISOString().slice(0, 10)}`;
  const refs: string[] = JSON.parse((await kvGet(key)) || '[]');
  if (refs.includes(ref)) return true;
  if (refs.length >= max) return false;
  await kvPut(key, JSON.stringify([...refs, ref]), { expirationTtl: 2 * 24 * 60 * 60 });
  return true;
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
