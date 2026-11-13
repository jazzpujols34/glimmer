import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockStore = new Map<string, string>();

vi.mock('@/lib/kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  kvDelete: vi.fn(),
  kvListKeys: vi.fn(() => Promise.resolve([])),
  getKV: vi.fn(() => Promise.resolve(null)),
}));

const checkVideoTaskStatus = vi.fn();
vi.mock('@/lib/veo', () => ({ checkVideoTaskStatus: (...a: unknown[]) => checkVideoTaskStatus(...a) }));

const archiveVideos = vi.fn();
vi.mock('@/lib/r2', () => ({ archiveVideos: (...a: unknown[]) => archiveVideos(...a) }));

const sendCompletionEmail = vi.fn();
vi.mock('@/lib/email', () => ({ sendCompletionEmail: (...a: unknown[]) => sendCompletionEmail(...a) }));

import { GET } from './route';
import { createJob, updateJob, getJob } from '@/lib/storage';

const request = { headers: new Headers({ 'cf-connecting-ip': '10.0.0.1' }) } as unknown as NextRequest;
const call = (id: string) => GET(request, { params: Promise.resolve({ id }) });

async function processingJob(id: string) {
  await createJob(id, { email: 'a@example.com', name: '阿嬤' });
  await updateJob(id, { status: 'processing', progress: 10, provider: 'byteplus', externalTaskIds: ['t1'] });
}

beforeEach(() => {
  mockStore.clear();
  vi.clearAllMocks();
  archiveVideos.mockImplementation((id: string, urls: string[]) =>
    Promise.resolve({ urls: urls.map((_, i) => `videos/${id}/${i}.mp4`), archived: true }));
  sendCompletionEmail.mockResolvedValue({ success: true });
});

describe('GET /api/status/[id]', () => {
  it('404s for an unknown job', async () => {
    expect((await call('job_missing')).status).toBe(404);
  });

  it('finishes a job and answers with permanent proxy links, never the storage keys', async () => {
    await processingJob('job_1');
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4', 'https://cdn/b.mp4'] });

    const body = await (await call('job_1')).json();

    expect(body).toMatchObject({ id: 'job_1', status: 'complete', progress: 100 });
    expect(body.videoUrl).toBe('/api/proxy-video?jobId=job_1&index=0');
    expect(body.videoUrls).toEqual(['/api/proxy-video?jobId=job_1&index=0', '/api/proxy-video?jobId=job_1&index=1']);
    expect(body.error).toBeUndefined();
    expect(sendCompletionEmail).toHaveBeenCalledTimes(1);
  });

  it('reports a provider failure as a plain string', async () => {
    await processingJob('job_2');
    checkVideoTaskStatus.mockResolvedValue({ done: true, error: { code: 'X', message: 'filtered' } });

    const body = await (await call('job_2')).json();

    expect(body).toMatchObject({ id: 'job_2', status: 'error', error: 'filtered' });
  });

  it('reports progress while the provider is still working', async () => {
    await processingJob('job_3');
    checkVideoTaskStatus.mockResolvedValue({ done: false, progress: 40 });

    expect(await (await call('job_3')).json()).toMatchObject({ status: 'processing', progress: 40 });
  });

  it('stays "processing" with a 200 when the provider cannot be reached', async () => {
    await processingJob('job_4');
    checkVideoTaskStatus.mockRejectedValue(new Error('fetch failed'));

    const res = await call('job_4');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'processing', progress: 10 });
  });

  it('retries the archive for a finished job that still holds expiring provider links', async () => {
    await processingJob('job_5');
    archiveVideos.mockResolvedValueOnce({ urls: ['https://cdn/a.mp4'], archived: false });
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4'] });
    const first = await (await call('job_5')).json();
    expect(first.videoUrl).toBe('https://cdn/a.mp4');
    expect(archiveVideos).toHaveBeenCalledTimes(1);

    const second = await (await call('job_5')).json();

    expect(second.videoUrl).toBe('/api/proxy-video?jobId=job_5&index=0');
    expect((await getJob('job_5'))?.archived).toBe(true);
    expect(checkVideoTaskStatus).toHaveBeenCalledTimes(1);
  });

  it('returns a queued job as it is, without asking the provider', async () => {
    await createJob('job_6');
    expect(await (await call('job_6')).json()).toMatchObject({ status: 'queued', progress: 0 });
    expect(checkVideoTaskStatus).not.toHaveBeenCalled();
  });
});
