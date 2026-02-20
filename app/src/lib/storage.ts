import type {
  GenerationJob,
  GenerationStatus,
  OccasionType,
  Project,
  Storyboard,
  StoryboardSlot,
  StoryboardTransitionType,
  AspectRatio,
  BatchJob,
  BatchStatus,
  GenerationSettings,
  QuickJob,
  QuickJobStatus,
} from '@/types';
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

// === Project Storage ===

const PROJECT_PREFIX = 'project:';

export async function createProject(
  name: string,
  email?: string,
  description?: string,
): Promise<Project> {
  const id = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  const project: Project = {
    id,
    name,
    description,
    email,
    createdAt: now,
    updatedAt: now,
    jobIds: [],
  };
  await kvPut(`${PROJECT_PREFIX}${id}`, JSON.stringify(project));
  return project;
}

export async function getProject(id: string): Promise<Project | undefined> {
  const data = await kvGet(`${PROJECT_PREFIX}${id}`);
  return data ? JSON.parse(data) : undefined;
}

export async function getAllProjects(email?: string): Promise<Project[]> {
  const keys = await kvListKeys(PROJECT_PREFIX);
  const projects: Project[] = [];
  for (const key of keys) {
    const data = await kvGet(key);
    if (data) {
      const project: Project = JSON.parse(data);
      // If email filter provided, only return projects for that user
      if (!email || project.email === email) {
        projects.push(project);
      }
    }
  }
  return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
  const project = await getProject(id);
  if (!project) return undefined;
  const updated = { ...project, ...updates, updatedAt: new Date().toISOString() };
  await kvPut(`${PROJECT_PREFIX}${id}`, JSON.stringify(updated));
  return updated;
}

export async function deleteProject(id: string): Promise<boolean> {
  const project = await getProject(id);
  if (!project) return false;
  await kvDelete(`${PROJECT_PREFIX}${id}`);
  return true;
}

export async function addJobToProject(projectId: string, jobId: string): Promise<Project | undefined> {
  const project = await getProject(projectId);
  if (!project) return undefined;

  // Avoid duplicates
  if (!project.jobIds.includes(jobId)) {
    project.jobIds.push(jobId);
    project.updatedAt = new Date().toISOString();

    // Set first job as cover if none set
    if (!project.coverJobId) {
      project.coverJobId = jobId;
    }

    await kvPut(`${PROJECT_PREFIX}${projectId}`, JSON.stringify(project));
  }

  // Also update the job to reference the project
  await updateJob(jobId, { projectId });

  return project;
}

export async function removeJobFromProject(projectId: string, jobId: string): Promise<Project | undefined> {
  const project = await getProject(projectId);
  if (!project) return undefined;

  project.jobIds = project.jobIds.filter(id => id !== jobId);
  project.updatedAt = new Date().toISOString();

  // Update cover if removed
  if (project.coverJobId === jobId) {
    project.coverJobId = project.jobIds[0];
  }

  await kvPut(`${PROJECT_PREFIX}${projectId}`, JSON.stringify(project));

  // Clear project reference from job
  await updateJob(jobId, { projectId: undefined });

  return project;
}

export async function getProjectJobs(projectId: string): Promise<GenerationJob[]> {
  const project = await getProject(projectId);
  if (!project) return [];

  const jobs: GenerationJob[] = [];
  for (const jobId of project.jobIds) {
    const job = await getJob(jobId);
    if (job) jobs.push(job);
  }

  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// === Storyboard Storage ===
// Storyboards are for composing multiple video clips into one final video

const STORYBOARD_PREFIX = 'storyboard:';

function generateSlotId(): string {
  return `slot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function createEmptySlots(count: number): StoryboardSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    id: generateSlotId(),
    index,
    status: 'empty' as const,
  }));
}

function createDefaultTransitions(count: number): StoryboardTransitionType[] {
  // count - 1 transitions (between each pair of adjacent slots)
  return Array.from({ length: Math.max(0, count - 1) }, () => 'cut' as const);
}

export async function createStoryboard(
  name: string,
  slotCount: number,
  aspectRatio: AspectRatio = '16:9',
  email?: string,
): Promise<Storyboard> {
  const id = `storyboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();

  const storyboard: Storyboard = {
    id,
    name,
    aspectRatio,
    slotCount,
    slots: createEmptySlots(slotCount),
    transitions: createDefaultTransitions(slotCount),
    createdAt: now,
    updatedAt: now,
    email,
  };

  await kvPut(`${STORYBOARD_PREFIX}${id}`, JSON.stringify(storyboard));
  return storyboard;
}

export async function getStoryboard(id: string): Promise<Storyboard | undefined> {
  const data = await kvGet(`${STORYBOARD_PREFIX}${id}`);
  return data ? JSON.parse(data) : undefined;
}

export async function getAllStoryboards(email?: string): Promise<Storyboard[]> {
  const keys = await kvListKeys(STORYBOARD_PREFIX);
  const storyboards: Storyboard[] = [];

  for (const key of keys) {
    const data = await kvGet(key);
    if (data) {
      const storyboard: Storyboard = JSON.parse(data);
      // If email filter provided, only return storyboards for that user
      if (!email || storyboard.email === email) {
        storyboards.push(storyboard);
      }
    }
  }

  return storyboards.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function updateStoryboard(
  id: string,
  updates: Partial<Omit<Storyboard, 'id' | 'createdAt'>>,
): Promise<Storyboard | undefined> {
  const storyboard = await getStoryboard(id);
  if (!storyboard) return undefined;

  const updated = { ...storyboard, ...updates, updatedAt: new Date().toISOString() };
  await kvPut(`${STORYBOARD_PREFIX}${id}`, JSON.stringify(updated));
  return updated;
}

export async function deleteStoryboard(id: string): Promise<boolean> {
  const storyboard = await getStoryboard(id);
  if (!storyboard) return false;
  await kvDelete(`${STORYBOARD_PREFIX}${id}`);
  return true;
}

export async function updateStoryboardSlot(
  storyboardId: string,
  slotIndex: number,
  slotUpdate: Partial<StoryboardSlot>,
): Promise<Storyboard | undefined> {
  const storyboard = await getStoryboard(storyboardId);
  if (!storyboard) return undefined;

  if (slotIndex < 0 || slotIndex >= storyboard.slots.length) {
    return undefined;
  }

  storyboard.slots[slotIndex] = {
    ...storyboard.slots[slotIndex],
    ...slotUpdate,
  };
  storyboard.updatedAt = new Date().toISOString();

  await kvPut(`${STORYBOARD_PREFIX}${storyboardId}`, JSON.stringify(storyboard));
  return storyboard;
}

export async function updateStoryboardTransition(
  storyboardId: string,
  transitionIndex: number,
  transition: StoryboardTransitionType,
): Promise<Storyboard | undefined> {
  const storyboard = await getStoryboard(storyboardId);
  if (!storyboard) return undefined;

  if (transitionIndex < 0 || transitionIndex >= storyboard.transitions.length) {
    return undefined;
  }

  storyboard.transitions[transitionIndex] = transition;
  storyboard.updatedAt = new Date().toISOString();

  await kvPut(`${STORYBOARD_PREFIX}${storyboardId}`, JSON.stringify(storyboard));
  return storyboard;
}

export async function reorderStoryboardSlots(
  storyboardId: string,
  fromIndex: number,
  toIndex: number,
): Promise<Storyboard | undefined> {
  const storyboard = await getStoryboard(storyboardId);
  if (!storyboard) return undefined;

  if (
    fromIndex < 0 || fromIndex >= storyboard.slots.length ||
    toIndex < 0 || toIndex >= storyboard.slots.length
  ) {
    return undefined;
  }

  // Swap slots
  const slots = [...storyboard.slots];
  const [movedSlot] = slots.splice(fromIndex, 1);
  slots.splice(toIndex, 0, movedSlot);

  // Update indices after reorder
  slots.forEach((slot, idx) => {
    slot.index = idx;
  });

  storyboard.slots = slots;
  storyboard.updatedAt = new Date().toISOString();

  await kvPut(`${STORYBOARD_PREFIX}${storyboardId}`, JSON.stringify(storyboard));
  return storyboard;
}

// === Batch Generation Storage ===
// Batch = N photos → N-1 video segments using first-last-frame mode

const BATCH_PREFIX = 'batch:';

export async function createBatch(
  name: string,
  email: string,
  occasion: OccasionType,
  settings: GenerationSettings,
  totalSegments: number,
  projectId: string,
): Promise<BatchJob> {
  const id = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();

  const batch: BatchJob = {
    id,
    status: 'queued',
    email,
    name,
    occasion,
    settings,
    segmentJobIds: [],
    projectId,
    totalSegments,
    completedSegments: 0,
    failedSegments: 0,
    createdAt: now,
    updatedAt: now,
  };

  await kvPut(`${BATCH_PREFIX}${id}`, JSON.stringify(batch));
  return batch;
}

export async function getBatch(id: string): Promise<BatchJob | undefined> {
  const data = await kvGet(`${BATCH_PREFIX}${id}`);
  return data ? JSON.parse(data) : undefined;
}

export async function updateBatch(
  id: string,
  updates: Partial<Omit<BatchJob, 'id' | 'createdAt'>>,
): Promise<BatchJob | undefined> {
  const batch = await getBatch(id);
  if (!batch) return undefined;

  const updated = { ...batch, ...updates, updatedAt: new Date().toISOString() };
  await kvPut(`${BATCH_PREFIX}${id}`, JSON.stringify(updated));
  return updated;
}

export async function addSegmentToBatch(
  batchId: string,
  jobId: string,
): Promise<BatchJob | undefined> {
  const batch = await getBatch(batchId);
  if (!batch) return undefined;

  if (!batch.segmentJobIds.includes(jobId)) {
    batch.segmentJobIds.push(jobId);
    batch.updatedAt = new Date().toISOString();
    await kvPut(`${BATCH_PREFIX}${batchId}`, JSON.stringify(batch));
  }

  return batch;
}

export async function updateBatchStatus(batchId: string): Promise<BatchJob | undefined> {
  const batch = await getBatch(batchId);
  if (!batch) return undefined;

  // Count completed and failed segments
  let completed = 0;
  let failed = 0;
  let processing = 0;

  for (const jobId of batch.segmentJobIds) {
    const job = await getJob(jobId);
    if (!job) continue;

    if (job.status === 'complete') {
      completed++;
    } else if (job.status === 'error') {
      failed++;
    } else {
      processing++;
    }
  }

  // Determine batch status
  let status: BatchStatus;
  if (processing > 0) {
    status = 'processing';
  } else if (failed === batch.segmentJobIds.length) {
    status = 'error';
  } else if (completed === batch.segmentJobIds.length) {
    status = 'complete';
  } else if (failed > 0 && completed > 0) {
    status = 'partial';
  } else {
    status = 'processing';
  }

  return updateBatch(batchId, {
    status,
    completedSegments: completed,
    failedSegments: failed,
  });
}

export async function getBatchJobs(batchId: string): Promise<GenerationJob[]> {
  const batch = await getBatch(batchId);
  if (!batch) return [];

  const jobs: GenerationJob[] = [];
  for (const jobId of batch.segmentJobIds) {
    const job = await getJob(jobId);
    if (job) jobs.push(job);
  }

  // Sort by segment index
  return jobs.sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));
}

// === Quick Template Storage ===
// Quick = one-click video generation with templates

const QUICK_PREFIX = 'quick:';

export async function createQuickJob(
  email: string,
  templateId: string,
  name: string,
  batchId: string,
  date?: string,
  message?: string,
): Promise<QuickJob> {
  const id = `quick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();

  const quick: QuickJob = {
    id,
    status: 'generating',
    email,
    templateId,
    name,
    date,
    message,
    batchId,
    createdAt: now,
    updatedAt: now,
  };

  await kvPut(`${QUICK_PREFIX}${id}`, JSON.stringify(quick));
  return quick;
}

export async function getQuickJob(id: string): Promise<QuickJob | undefined> {
  const data = await kvGet(`${QUICK_PREFIX}${id}`);
  return data ? JSON.parse(data) : undefined;
}

export async function updateQuickJob(
  id: string,
  updates: Partial<Omit<QuickJob, 'id' | 'createdAt'>>,
): Promise<QuickJob | undefined> {
  const quick = await getQuickJob(id);
  if (!quick) return undefined;

  const updated = { ...quick, ...updates, updatedAt: new Date().toISOString() };
  await kvPut(`${QUICK_PREFIX}${id}`, JSON.stringify(updated));
  return updated;
}
