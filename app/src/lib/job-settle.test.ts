import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStore = new Map<string, string>();

vi.mock('./kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  kvDelete: vi.fn(),
  kvListKeys: vi.fn(() => Promise.resolve([])),
}));

const checkVideoTaskStatus = vi.fn();
vi.mock('./veo', () => ({ checkVideoTaskStatus: (...a: unknown[]) => checkVideoTaskStatus(...a) }));

const archiveVideos = vi.fn();
vi.mock('./r2', () => ({ archiveVideos: (...a: unknown[]) => archiveVideos(...a) }));

const checkCredits = vi.fn();
vi.mock('./credits', () => ({ checkCredits: (...a: unknown[]) => checkCredits(...a) }));

const sendCompletionEmail = vi.fn();
vi.mock('./email', () => ({ sendCompletionEmail: (...a: unknown[]) => sendCompletionEmail(...a) }));

vi.mock('./errors', async (orig) => ({
  ...(await orig<typeof import('./errors')>()),
  captureError: vi.fn(),
}));

import { settleJob, archiveIfNeeded } from './job-settle';
import { createJob, getJob, updateJob } from './storage';
import type { GenerationJob } from '@/types';

async function processingJob(id: string, extra: Partial<GenerationJob> = {}): Promise<GenerationJob> {
  await createJob(id, { email: 'a@example.com', name: '阿嬤' });
  return (await updateJob(id, { status: 'processing', provider: 'byteplus', externalTaskIds: ['t1'], ...extra }))!;
}

beforeEach(() => {
  mockStore.clear();
  vi.clearAllMocks();
  archiveVideos.mockImplementation((id: string, urls: string[]) =>
    Promise.resolve({ urls: urls.map((_, i) => `videos/${id}/${i}.mp4`), archived: true }));
  checkCredits.mockResolvedValue({ paidTotal: 0 });
  sendCompletionEmail.mockResolvedValue({ success: true });
});

describe('settleJob', () => {
  it('finishes a job: archives, stores, and notifies once with the job link', async () => {
    const job = await processingJob('job_1');
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4'] });

    const settled = await settleJob(job);

    expect(settled.status).toBe('complete');
    expect(settled.videoUrls).toEqual(['videos/job_1/0.mp4']);
    expect(settled.archived).toBe(true);
    expect((await getJob('job_1'))?.status).toBe('complete');
    expect(sendCompletionEmail).toHaveBeenCalledTimes(1);
    expect(sendCompletionEmail).toHaveBeenCalledWith('a@example.com', 'job_1', '阿嬤');
  });

  it('stores a provider failure as a plain string', async () => {
    const job = await processingJob('job_2');
    checkVideoTaskStatus.mockResolvedValue({ done: true, error: { code: 'X', message: 'filtered' } });

    const settled = await settleJob(job);

    expect(settled.status).toBe('error');
    expect(settled.error).toBe('filtered');
    expect(sendCompletionEmail).not.toHaveBeenCalled();
  });

  it('records progress while the provider is still working', async () => {
    const job = await processingJob('job_3');
    checkVideoTaskStatus.mockResolvedValue({ done: false, progress: 55 });

    const settled = await settleJob(job);

    expect(settled.status).toBe('processing');
    expect(settled.progress).toBe(55);
    expect((await getJob('job_3'))?.progress).toBe(55);
  });

  it('leaves the job running when the provider cannot be reached', async () => {
    const job = await processingJob('job_4');
    checkVideoTaskStatus.mockRejectedValue(new Error('fetch failed'));

    const settled = await settleJob(job);

    expect(settled.status).toBe('processing');
    expect((await getJob('job_4'))?.status).toBe('processing');
  });

  it('does not ask the provider about a job that is not processing', async () => {
    await createJob('job_5');
    const settled = await settleJob((await getJob('job_5'))!);
    expect(settled.status).toBe('queued');
    expect(checkVideoTaskStatus).not.toHaveBeenCalled();
  });

  it('does not notify twice when another poll finished the job first', async () => {
    const stale = await processingJob('job_6');
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4'] });
    await settleJob(stale);
    const again = await settleJob(stale); // second poll still holds the old "processing" copy

    expect(again.status).toBe('complete');
    expect(sendCompletionEmail).toHaveBeenCalledTimes(1);
  });

  it('a batch notifies once, on its first segment, with the batch link and name', async () => {
    const first = await processingJob('job_7', { batchId: 'batch_9', segmentIndex: 0 });
    const second = await processingJob('job_8', { batchId: 'batch_9', segmentIndex: 1 });
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4'] });

    await settleJob(second, { batchName: '阿嬤追思' });
    expect(sendCompletionEmail).not.toHaveBeenCalled();

    await settleJob(first, { batchName: '阿嬤追思' });
    expect(sendCompletionEmail).toHaveBeenCalledTimes(1);
    expect(sendCompletionEmail).toHaveBeenCalledWith('a@example.com', 'batch_9', '阿嬤追思');
  });

  it('gives paying users the long record lifetime', async () => {
    const job = await processingJob('job_9');
    checkCredits.mockResolvedValue({ paidTotal: 20 });
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4'] });
    const { kvPut } = await import('./kv');

    await settleJob(job);

    const lastPut = vi.mocked(kvPut).mock.calls.at(-1)!;
    expect(lastPut[2]).toEqual({ expirationTtl: 2592000 });
  });
});

describe('archiveIfNeeded', () => {
  it('retries a finished job that still points at expiring provider links', async () => {
    const job = await processingJob('job_10');
    archiveVideos.mockResolvedValueOnce({ urls: ['https://cdn/a.mp4'], archived: false });
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4'] });
    const settled = await settleJob(job);
    expect(settled.archived).toBe(false);

    const fixed = await archiveIfNeeded(settled);

    expect(fixed.archived).toBe(true);
    expect(fixed.videoUrl).toBe('videos/job_10/0.mp4');
    expect((await getJob('job_10'))?.archived).toBe(true);
  });

  it('does nothing for an already archived job', async () => {
    const job = await processingJob('job_11');
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4'] });
    const settled = await settleJob(job);
    archiveVideos.mockClear();

    await archiveIfNeeded(settled);

    expect(archiveVideos).not.toHaveBeenCalled();
  });

  it('keeps the provider links when the retry fails', async () => {
    const job = await processingJob('job_12');
    archiveVideos.mockResolvedValueOnce({ urls: ['https://cdn/a.mp4'], archived: false });
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4'] });
    const settled = await settleJob(job);
    archiveVideos.mockRejectedValueOnce(new Error('r2 down'));

    const same = await archiveIfNeeded(settled);

    expect(same.videoUrls).toEqual(['https://cdn/a.mp4']);
  });
});
