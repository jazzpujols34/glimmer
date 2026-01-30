import type { GenerationJob, GenerationStatus, OccasionType } from '@/types';

// In-memory storage using globalThis to survive hot reloading in development.
// Note: On Edge runtime (Cloudflare Pages), data resets on cold start.
// Video URLs persist on external CDNs regardless.
const globalForJobs = globalThis as unknown as {
  __glimmer_jobs: Map<string, GenerationJob> | undefined;
};

if (!globalForJobs.__glimmer_jobs) {
  globalForJobs.__glimmer_jobs = new Map<string, GenerationJob>();
}

const jobs = globalForJobs.__glimmer_jobs;

export function createJob(id: string, metadata?: { name?: string; occasion?: OccasionType; settings?: GenerationJob['settings'] }): GenerationJob {
  const job: GenerationJob = {
    id,
    status: 'queued',
    progress: 0,
    createdAt: new Date().toISOString(),
    ...metadata,
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): GenerationJob | undefined {
  return jobs.get(id);
}

export function getAllJobIds(): string[] {
  return Array.from(jobs.keys());
}

export function getAllJobs(): GenerationJob[] {
  return Array.from(jobs.values());
}

export function getCompletedJobs(): GenerationJob[] {
  return Array.from(jobs.values())
    .filter(job => job.status === 'complete' && job.videoUrl)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function updateJob(id: string, updates: Partial<GenerationJob>): GenerationJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;

  const updated = { ...job, ...updates };
  jobs.set(id, updated);
  return updated;
}

export function setJobStatus(id: string, status: GenerationStatus, progress?: number): GenerationJob | undefined {
  return updateJob(id, { status, progress });
}

export function setJobComplete(id: string, videoUrl: string, videoUrls?: string[]): GenerationJob | undefined {
  return updateJob(id, {
    status: 'complete',
    progress: 100,
    videoUrl,
    videoUrls: videoUrls || [videoUrl],
  });
}

export function setJobError(id: string, error: string): GenerationJob | undefined {
  return updateJob(id, { status: 'error', error });
}

export function deleteJob(id: string): boolean {
  return jobs.delete(id);
}
