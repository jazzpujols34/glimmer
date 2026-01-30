import type { GenerationJob, GenerationStatus, OccasionType } from '@/types';

/**
 * Storage abstraction: Cloudflare KV when deployed, in-memory Map for local dev.
 * All functions are async to support KV's async API.
 */

// --- KV access (Cloudflare Pages) ---

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

async function getKV(): Promise<KVNamespaceLike | null> {
  try {
    const { getRequestContext } = await import('@cloudflare/next-on-pages');
    const ctx = getRequestContext();
    const kv = (ctx.env as Record<string, unknown>).GLIMMER_KV as KVNamespaceLike | undefined;
    return kv || null;
  } catch {
    return null;
  }
}

// --- In-memory fallback (local dev) ---

const globalStore = globalThis as unknown as { __glimmer_kv_map?: Map<string, string> };
if (!globalStore.__glimmer_kv_map) globalStore.__glimmer_kv_map = new Map();
const memMap = globalStore.__glimmer_kv_map;

// --- Unified KV helpers ---

async function kvGet(key: string): Promise<string | null> {
  const kv = await getKV();
  if (kv) return kv.get(key);
  return memMap.get(key) ?? null;
}

async function kvPut(key: string, value: string): Promise<void> {
  const kv = await getKV();
  if (kv) { await kv.put(key, value, { expirationTtl: 86400 }); return; }
  memMap.set(key, value);
}

async function kvDelete(key: string): Promise<void> {
  const kv = await getKV();
  if (kv) { await kv.delete(key); return; }
  memMap.delete(key);
}

async function kvListKeys(prefix: string): Promise<string[]> {
  const kv = await getKV();
  if (kv) {
    const list = await kv.list({ prefix });
    return list.keys.map(k => k.name);
  }
  return Array.from(memMap.keys()).filter(k => k.startsWith(prefix));
}

// --- Public API (all async) ---

const KEY_PREFIX = 'job:';

export async function createJob(
  id: string,
  metadata?: { name?: string; occasion?: OccasionType; settings?: GenerationJob['settings'] },
): Promise<GenerationJob> {
  const job: GenerationJob = {
    id,
    status: 'queued',
    progress: 0,
    createdAt: new Date().toISOString(),
    ...metadata,
  };
  await kvPut(`${KEY_PREFIX}${id}`, JSON.stringify(job));
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
      if (job.status === 'complete' && job.videoUrl) {
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
  await kvPut(`${KEY_PREFIX}${id}`, JSON.stringify(updated));
  return updated;
}

export async function setJobStatus(id: string, status: GenerationStatus, progress?: number): Promise<GenerationJob | undefined> {
  return updateJob(id, { status, progress });
}

export async function setJobComplete(id: string, videoUrl: string, videoUrls?: string[]): Promise<GenerationJob | undefined> {
  return updateJob(id, {
    status: 'complete',
    progress: 100,
    videoUrl,
    videoUrls: videoUrls || [videoUrl],
  });
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
