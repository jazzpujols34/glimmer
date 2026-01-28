import type { GenerationJob, GenerationStatus } from '@/types';

// In-memory storage for MVP (replace with database in production)
// Use globalThis to survive hot reloading in development
const globalForJobs = globalThis as unknown as { __glimmer_jobs: Map<string, GenerationJob> | undefined };

if (!globalForJobs.__glimmer_jobs) {
  globalForJobs.__glimmer_jobs = new Map<string, GenerationJob>();
}

const jobs = globalForJobs.__glimmer_jobs;

export function createJob(id: string): GenerationJob {
  const job: GenerationJob = {
    id,
    status: 'queued',
    progress: 0,
    createdAt: new Date().toISOString(),
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

export function setJobComplete(id: string, videoUrl: string): GenerationJob | undefined {
  return updateJob(id, { status: 'complete', progress: 100, videoUrl });
}

export function setJobError(id: string, error: string): GenerationJob | undefined {
  return updateJob(id, { status: 'error', error });
}
