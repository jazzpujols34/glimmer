import type { GenerationJob, GenerationStatus, OccasionType } from '@/types';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Path to the persistent storage file
const DATA_DIR = join(process.cwd(), 'data');
const JOBS_FILE = join(DATA_DIR, 'jobs.json');

// Ensure data directory exists
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Load jobs from file
function loadJobsFromFile(): Map<string, GenerationJob> {
  try {
    ensureDataDir();
    if (existsSync(JOBS_FILE)) {
      const data = readFileSync(JOBS_FILE, 'utf-8');
      const jobsArray: GenerationJob[] = JSON.parse(data);
      return new Map(jobsArray.map(job => [job.id, job]));
    }
  } catch (error) {
    console.error('[Storage] Error loading jobs from file:', error);
  }
  return new Map();
}

// Save jobs to file
function saveJobsToFile(jobs: Map<string, GenerationJob>) {
  try {
    ensureDataDir();
    const jobsArray = Array.from(jobs.values());
    writeFileSync(JOBS_FILE, JSON.stringify(jobsArray, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Storage] Error saving jobs to file:', error);
  }
}

// In-memory storage backed by file persistence
// Use globalThis to survive hot reloading in development
const globalForJobs = globalThis as unknown as {
  __glimmer_jobs: Map<string, GenerationJob> | undefined;
  __glimmer_jobs_loaded: boolean | undefined;
};

// Initialize from file on first access
if (!globalForJobs.__glimmer_jobs_loaded) {
  globalForJobs.__glimmer_jobs = loadJobsFromFile();
  globalForJobs.__glimmer_jobs_loaded = true;
  console.log(`[Storage] Loaded ${globalForJobs.__glimmer_jobs.size} jobs from file`);
}

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
  saveJobsToFile(jobs);
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

  // Only persist to file for significant status changes (not every progress update)
  if (updates.status === 'complete' || updates.status === 'error' || updates.videoUrl || updates.videoUrls) {
    saveJobsToFile(jobs);
  }

  return updated;
}

export function setJobStatus(id: string, status: GenerationStatus, progress?: number): GenerationJob | undefined {
  return updateJob(id, { status, progress });
}

export function setJobComplete(id: string, videoUrl: string, videoUrls?: string[]): GenerationJob | undefined {
  const result = updateJob(id, {
    status: 'complete',
    progress: 100,
    videoUrl,
    videoUrls: videoUrls || [videoUrl],
  });
  // Ensure file is saved when job completes
  saveJobsToFile(jobs);
  return result;
}

export function setJobError(id: string, error: string): GenerationJob | undefined {
  const result = updateJob(id, { status: 'error', error });
  saveJobsToFile(jobs);
  return result;
}

export function deleteJob(id: string): boolean {
  const existed = jobs.delete(id);
  if (existed) {
    saveJobsToFile(jobs);
  }
  return existed;
}
