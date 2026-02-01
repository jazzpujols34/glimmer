import type { GenerationJob, GenerationStatus, OccasionType } from '@/types';
import { kvGet, kvPut, kvDelete, kvListKeys } from './kv';

/**
 * Job storage: uses shared KV abstraction from kv.ts.
 * Jobs expire after 24 hours (expirationTtl: 86400).
 */

const JOB_TTL = 86400;          // 24 hours (free tier)
const PAID_JOB_TTL = 2592000;   // 30 days (paid users)

// --- Public API (all async) ---

const KEY_PREFIX = 'job:';

export async function createJob(
  id: string,
  metadata?: { name?: string; occasion?: OccasionType; settings?: GenerationJob['settings']; email?: string },
): Promise<GenerationJob> {
  const job: GenerationJob = {
    id,
    status: 'queued',
    progress: 0,
    createdAt: new Date().toISOString(),
    ...metadata,
  };
  await kvPut(`${KEY_PREFIX}${id}`, JSON.stringify(job), { expirationTtl: JOB_TTL });
  return job;
}

export async function getJob(id: string): Promise<GenerationJob | undefined> {
  const data = await kvGet(`${KEY_PREFIX}${id}`);
  return data ? JSON.parse(data) : undefined;
}

export async function getAllJobIds(): Promise<string[]> {
  const keys = await kvListKeys(KEY_PREFIX);
  return keys.map(k => k.replace(KEY_PREFIX, ''));
}

export async function getCompletedJobs(): Promise<GenerationJob[]> {
  const keys = await kvListKeys(KEY_PREFIX);
  const jobs: GenerationJob[] = [];
  for (const key of keys) {
    const data = await kvGet(key);
    if (data) {
      const job: GenerationJob = JSON.parse(data);
      if (job.status === 'complete' && (job.videoUrl || job.videoUrls?.length)) {
        jobs.push(job);
      }
    }
  }
  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateJob(id: string, updates: Partial<GenerationJob>): Promise<GenerationJob | undefined> {
  const job = await getJob(id);
  if (!job) return undefined;
  const updated = { ...job, ...updates };
  await kvPut(`${KEY_PREFIX}${id}`, JSON.stringify(updated), { expirationTtl: JOB_TTL });
  return updated;
}

export async function setJobStatus(id: string, status: GenerationStatus, progress?: number): Promise<GenerationJob | undefined> {
  return updateJob(id, { status, progress });
}

export async function setJobComplete(
  id: string,
  videoUrl: string,
  videoUrls?: string[],
  options?: { paidUser?: boolean; archived?: boolean },
): Promise<GenerationJob | undefined> {
  const ttl = options?.paidUser ? PAID_JOB_TTL : JOB_TTL;
  const job = await getJob(id);
  if (!job) return undefined;
  const updated = {
    ...job,
    status: 'complete' as GenerationStatus,
    progress: 100,
    videoUrl,
    videoUrls: videoUrls || [videoUrl],
    archived: options?.archived,
  };
  await kvPut(`${KEY_PREFIX}${id}`, JSON.stringify(updated), { expirationTtl: ttl });
  return updated;
}

export async function setJobError(id: string, error: string): Promise<GenerationJob | undefined> {
  return updateJob(id, { status: 'error', error });
}

export async function deleteJob(id: string): Promise<boolean> {
  const job = await getJob(id);
  if (!job) return false;
  await kvDelete(`${KEY_PREFIX}${id}`);
  return true;
}
