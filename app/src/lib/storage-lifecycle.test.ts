import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStore = new Map<string, string>();
const ttls = new Map<string, number | undefined>();

vi.mock('./kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string, opts?: { expirationTtl?: number }) => {
    mockStore.set(key, value);
    ttls.set(key, opts?.expirationTtl);
    return Promise.resolve();
  }),
  kvDelete: vi.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
  kvListKeys: vi.fn((prefix: string) =>
    Promise.resolve(Array.from(mockStore.keys()).filter((k) => k.startsWith(prefix)))
  ),
}));

import {
  createJob,
  getJob,
  updateJob,
  setJobComplete,
  setJobError,
  createBatch,
  addSegmentToBatch,
  updateBatchStatus,
  getBatch,
  createQuickJob,
  updateQuickJob,
  getQuickJob,
} from './storage';
import { defaultSettings } from '@/types';

const DAY = 86400;
const THIRTY_DAYS = 2592000;

beforeEach(() => {
  mockStore.clear();
  ttls.clear();
});

async function processingJob(id: string) {
  await createJob(id, { email: 'a@example.com' });
  await updateJob(id, { status: 'processing', provider: 'byteplus', externalTaskIds: ['t1'] });
}

describe('job status is a one-way street once it reaches a final state', () => {
  it('a late error cannot overwrite a finished video (two polls racing)', async () => {
    await processingJob('job_1');
    // Poll B finishes the job...
    await setJobComplete('job_1', 'videos/job_1/0.mp4', ['videos/job_1/0.mp4'], { archived: true });
    // ...then poll A, which read "processing" earlier, reports a provider hiccup.
    const result = await setJobError('job_1', 'BytePlus status check failed: 500');

    const stored = await getJob('job_1');
    expect(stored?.status).toBe('complete');
    expect(stored?.error).toBeUndefined();
    expect(stored?.videoUrl).toBe('videos/job_1/0.mp4');
    // The caller gets the stored truth back, not its stale wish.
    expect(result?.status).toBe('complete');
  });

  it('a late completion cannot revive a job that already failed', async () => {
    await processingJob('job_2');
    await setJobError('job_2', 'boom');
    await setJobComplete('job_2', 'https://cdn/x.mp4');
    expect((await getJob('job_2'))?.status).toBe('error');
  });

  it('a second completion does not replace the first one\'s video list', async () => {
    await processingJob('job_3');
    await setJobComplete('job_3', 'videos/job_3/0.mp4', ['videos/job_3/0.mp4'], { archived: true });
    await setJobComplete('job_3', 'https://cdn/x.mp4', ['https://cdn/x.mp4'], { archived: false });
    const stored = await getJob('job_3');
    expect(stored?.videoUrls).toEqual(['videos/job_3/0.mp4']);
    expect(stored?.archived).toBe(true);
  });

  it('updateJob refuses to move a finished job back to processing', async () => {
    await processingJob('job_4');
    await setJobComplete('job_4', 'videos/job_4/0.mp4', undefined, { archived: true });
    await updateJob('job_4', { status: 'processing', progress: 10 });
    const stored = await getJob('job_4');
    expect(stored?.status).toBe('complete');
    expect(stored?.progress).toBe(100);
  });

  it('a late progress tick does not rewind a finished job', async () => {
    await processingJob('job_5');
    await setJobComplete('job_5', 'videos/job_5/0.mp4', undefined, { archived: true });
    await updateJob('job_5', { progress: 40 });
    expect((await getJob('job_5'))?.progress).toBe(100);
  });

  it('still allows the normal path and non-status edits on finished jobs', async () => {
    await processingJob('job_6');
    expect((await getJob('job_6'))?.status).toBe('processing');
    await setJobComplete('job_6', 'videos/job_6/0.mp4', undefined, { archived: true });
    const updated = await updateJob('job_6', { favorite: true });
    expect(updated?.favorite).toBe(true);
    expect(updated?.status).toBe('complete');
  });
});

describe('job record lifetime', () => {
  it('a paid job keeps its 30 days when a failed archive succeeds on retry', async () => {
    await processingJob('job_7');
    await setJobComplete('job_7', 'https://cdn/x.mp4', ['https://cdn/x.mp4'], { paidUser: true, archived: false });
    expect(ttls.get('job:job_7')).toBe(THIRTY_DAYS);
    await updateJob('job_7', { videoUrl: 'videos/job_7/0.mp4', videoUrls: ['videos/job_7/0.mp4'], archived: true });
    expect(ttls.get('job:job_7')).toBe(THIRTY_DAYS);
  });

  it('an unfinished job keeps the 24 hour lifetime', async () => {
    await processingJob('job_8');
    expect(ttls.get('job:job_8')).toBe(DAY);
  });
});

describe('batch status never slides backwards', () => {
  async function batchWith(ids: string[]) {
    const batch = await createBatch('測試', 'a@example.com', 'memorial', defaultSettings, ids.length, 'project_1');
    for (const id of ids) {
      await processingJob(id);
      await addSegmentToBatch(batch.id, id);
    }
    return batch.id;
  }

  it('a finished batch stays finished after its segment records expire', async () => {
    const batchId = await batchWith(['job_a', 'job_b']);
    await setJobComplete('job_a', 'videos/job_a/0.mp4', undefined, { archived: true });
    await setJobComplete('job_b', 'videos/job_b/0.mp4', undefined, { archived: true });
    expect((await updateBatchStatus(batchId))?.status).toBe('complete');

    // Segment records carry a lifetime; the batch record does not.
    mockStore.delete('job:job_a');
    mockStore.delete('job:job_b');

    const after = await updateBatchStatus(batchId);
    expect(after?.status).toBe('complete');
    expect(after?.completedSegments).toBe(2);
    expect((await getBatch(batchId))?.status).toBe('complete');
  });

  it('a segment whose record vanished mid-run counts as failed, not as still running', async () => {
    const batchId = await batchWith(['job_c', 'job_d']);
    await setJobComplete('job_c', 'videos/job_c/0.mp4', undefined, { archived: true });
    mockStore.delete('job:job_d');
    const after = await updateBatchStatus(batchId);
    expect(after?.status).toBe('partial');
    expect(after?.failedSegments).toBe(1);
  });

  it('reports processing while any segment is still running', async () => {
    const batchId = await batchWith(['job_e', 'job_f']);
    await setJobError('job_e', 'boom');
    expect((await updateBatchStatus(batchId))?.status).toBe('processing');
  });
});

describe('quick job status is one-way too', () => {
  it('a late "exporting" write cannot undo a finished quick job', async () => {
    const quick = await createQuickJob('a@example.com', 'memorial-gentle', '測試', 'batch_1');
    await updateQuickJob(quick.id, { status: 'exporting', exportId: 'exp_1' });
    await updateQuickJob(quick.id, { status: 'complete', videoR2Key: 'exports/x.mp4' });
    await updateQuickJob(quick.id, { status: 'exporting', exportId: 'exp_2' });
    const stored = await getQuickJob(quick.id);
    expect(stored?.status).toBe('complete');
    expect(stored?.exportId).toBe('exp_1');
  });
});
