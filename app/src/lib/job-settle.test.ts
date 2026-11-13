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
const refundCredits = vi.fn();
vi.mock('./credits', () => ({
  checkCredits: (...a: unknown[]) => checkCredits(...a),
  refundCredits: (...a: unknown[]) => refundCredits(...a),
}));

const sendAdminAlert = vi.fn(() => Promise.resolve());
vi.mock('./telegram', () => ({ sendAdminAlert: (...a: unknown[]) => sendAdminAlert(...(a as [])) }));

const sendCompletionEmail = vi.fn();
vi.mock('./email', () => ({ sendCompletionEmail: (...a: unknown[]) => sendCompletionEmail(...a) }));

vi.mock('./errors', async (orig) => ({
  ...(await orig<typeof import('./errors')>()),
  captureError: vi.fn(),
}));

import { settleJob, archiveIfNeeded, refundIfOwed } from './job-settle';
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
  refundCredits.mockResolvedValue(undefined);
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

describe('settleJob — the customer gets the credits back when the provider fails', () => {
  const charge = (ref: string, paid = 6, free = 0) => ({ free, paid, ref });
  const failNow = () => checkVideoTaskStatus.mockResolvedValue({ done: true, error: 'OutputVideoSensitiveContentDetected' });

  it('refunds exactly what the job was charged and records the amount', async () => {
    const job = await processingJob('job_r1', { charge: charge('job_r1') });
    failNow();

    const settled = await settleJob(job);

    expect(settled.status).toBe('error');
    expect(settled.refundedCredits).toBe(6);
    expect(refundCredits).toHaveBeenCalledWith('a@example.com', 'job_r1', 0, 6);
    expect((await getJob('job_r1'))?.refundedCredits).toBe(6);
  });

  it('the stored error never claims a refund — that is the screen\'s job, from the recorded amount', async () => {
    const job = await processingJob('job_r1b', { charge: charge('job_r1b') });
    failNow();
    expect((await settleJob(job)).error).not.toContain('退還');
  });

  it('does not refund a job with no charge on record', async () => {
    const job = await processingJob('job_r3');
    failNow();
    const settled = await settleJob(job);
    expect(settled.status).toBe('error');
    expect(settled.refundedCredits).toBeUndefined();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it('does not refund a job that finished', async () => {
    const job = await processingJob('job_r4', { charge: charge('job_r4') });
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4'] });
    await settleJob(job);
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it('does not refund when a completion won the race against the failure', async () => {
    const stale = await processingJob('job_r5', { charge: charge('job_r5') });
    checkVideoTaskStatus.mockResolvedValueOnce({ done: true, videoUrls: ['https://cdn/a.mp4'] });
    await settleJob(stale);
    checkVideoTaskStatus.mockResolvedValueOnce({ done: true, error: 'late hiccup' });
    const again = await settleJob(stale);
    expect(again.status).toBe('complete');
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it('a refund that failed to write is not shown as done, and is retried on the next look', async () => {
    const job = await processingJob('job_r6', { charge: charge('job_r6') });
    failNow();
    refundCredits.mockRejectedValueOnce(new Error('kv down'));

    const settled = await settleJob(job);
    expect(settled.status).toBe('error');
    expect(settled.refundedCredits).toBeUndefined();

    const retried = await refundIfOwed(settled);
    expect(retried.refundedCredits).toBe(6);
    expect(refundCredits).toHaveBeenCalledTimes(2);
  });

  it('refundIfOwed leaves alone a job already refunded, held, running, or never charged', async () => {
    const base = await processingJob('job_r7', { charge: charge('job_r7') });
    await refundIfOwed(base); // still processing
    await refundIfOwed({ ...base, status: 'error', refundedCredits: 6 });
    await refundIfOwed({ ...base, status: 'error', refundHeld: true });
    await refundIfOwed({ ...base, status: 'error', charge: undefined });
    await refundIfOwed({ ...base, status: 'complete', videoUrls: ['videos/x/0.mp4'] });
    expect(refundCredits).not.toHaveBeenCalled();
  });
});

describe('settleJob — automatic refunds are capped, so failing on purpose is not free', () => {
  async function failOne(id: string, extra: Partial<GenerationJob> = {}) {
    const job = await processingJob(id, { charge: { free: 0, paid: 1, ref: id }, ...extra });
    checkVideoTaskStatus.mockResolvedValue({ done: true, error: 'OutputVideoSensitiveContentDetected' });
    return settleJob(job);
  }

  it('the email gets three automatic refunds a day; the fourth is held for review, not refunded', async () => {
    for (const id of ['job_c1', 'job_c2', 'job_c3']) {
      expect((await failOne(id)).refundedCredits).toBe(1);
    }
    const fourth = await failOne('job_c4');

    expect(fourth.status).toBe('error');
    expect(fourth.refundHeld).toBe(true);
    expect(sendAdminAlert).toHaveBeenCalledTimes(1);
    expect(fourth.refundedCredits).toBeUndefined();
    expect(refundCredits).toHaveBeenCalledTimes(3);
  });

  it('one failure asked about many times uses one slot of the cap, not several', async () => {
    const job = await processingJob('job_c5', { charge: { free: 0, paid: 1, ref: 'job_c5' } });
    checkVideoTaskStatus.mockResolvedValue({ done: true, error: 'boom' });
    await Promise.all([settleJob(job), settleJob(job), settleJob(job)]);
    for (const id of ['job_c6', 'job_c7']) {
      expect((await failOne(id)).refundedCredits).toBe(1);
    }
  });

  it('many emails behind one address share a cap of five a day', async () => {
    for (let i = 0; i < 5; i++) {
      await createJob(`job_ip${i}`, { email: `user${i}@example.com` });
      const job = (await updateJob(`job_ip${i}`, {
        status: 'processing', provider: 'byteplus', externalTaskIds: ['t'], ip: '203.0.113.9',
        charge: { free: 1, paid: 0, ref: `job_ip${i}` },
      }))!;
      checkVideoTaskStatus.mockResolvedValue({ done: true, error: 'boom' });
      expect((await settleJob(job)).refundedCredits).toBe(1);
    }
    await createJob('job_ip5', { email: 'user5@example.com' });
    const sixth = (await updateJob('job_ip5', {
      status: 'processing', provider: 'byteplus', externalTaskIds: ['t'], ip: '203.0.113.9',
      charge: { free: 1, paid: 0, ref: 'job_ip5' },
    }))!;
    expect((await settleJob(sixth)).refundHeld).toBe(true);
  });
});

describe('settleJob — some versions fail, the good ones are kept', () => {
  it('four ordered, one failed: three videos kept, a quarter of the charge refunded', async () => {
    const job = await processingJob('job_p1', {
      externalTaskIds: ['t1', 't2', 't3', 't4'],
      charge: { free: 0, paid: 4, ref: 'job_p1' },
    });
    checkVideoTaskStatus.mockResolvedValue({
      done: true, videoUrls: ['https://cdn/a.mp4', 'https://cdn/c.mp4', 'https://cdn/d.mp4'], failedCount: 1, error: 'filtered',
    });

    const settled = await settleJob(job);

    expect(settled.status).toBe('complete');
    expect(settled.videoUrls).toHaveLength(3);
    expect(settled.failedVideos).toBe(1);
    expect(settled.refundedCredits).toBe(1);
    expect(settled.error).toBeUndefined();
    expect(refundCredits).toHaveBeenCalledWith('a@example.com', 'job_p1', 0, 1);
  });

  it('rounds an uneven share in the customer\'s favour', async () => {
    const job = await processingJob('job_p2', {
      externalTaskIds: ['t1', 't2', 't3'],
      charge: { free: 0, paid: 5, ref: 'job_p2' },
    });
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4', 'https://cdn/b.mp4'], failedCount: 1 });
    expect((await settleJob(job)).refundedCredits).toBe(2); // 5 / 3 = 1.67
  });

  it('a partial refund that failed to write is retried with the same share', async () => {
    const job = await processingJob('job_p3', {
      externalTaskIds: ['t1', 't2'],
      charge: { free: 0, paid: 4, ref: 'job_p3' },
    });
    checkVideoTaskStatus.mockResolvedValue({ done: true, videoUrls: ['https://cdn/a.mp4'], failedCount: 1 });
    refundCredits.mockRejectedValueOnce(new Error('kv down'));
    const settled = await settleJob(job);
    expect(settled.status).toBe('complete');
    expect(settled.refundedCredits).toBeUndefined();

    expect((await refundIfOwed(settled)).refundedCredits).toBe(2);
  });
});

describe('settleJob — a job the provider never finishes', () => {
  async function agedJob(id: string, hours: number, extra: Partial<GenerationJob> = {}) {
    await processingJob(id, extra);
    const raw = JSON.parse(mockStore.get(`job:${id}`)!);
    raw.createdAt = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    mockStore.set(`job:${id}`, JSON.stringify(raw));
    return (await getJob(id))!;
  }

  it('fails and refunds after three hours of "still working"', async () => {
    const job = await agedJob('job_s1', 4, { charge: { free: 1, paid: 0, ref: 'job_s1' } });
    checkVideoTaskStatus.mockResolvedValue({ done: false, progress: 10 });

    const settled = await settleJob(job);

    expect(settled.status).toBe('error');
    expect(settled.error).toContain('逾時');
    expect(settled.refundedCredits).toBe(1);
    expect(refundCredits).toHaveBeenCalledWith('a@example.com', 'job_s1', 1, 0);
  });

  it('also when the provider cannot be asked at all for three hours', async () => {
    const job = await agedJob('job_s4', 4, { charge: { free: 1, paid: 0, ref: 'job_s4' } });
    checkVideoTaskStatus.mockRejectedValue(new Error('BYTEPLUS_API_KEY not set'));
    expect((await settleJob(job)).status).toBe('error');
  });

  it('leaves a two-hour-old job running', async () => {
    const job = await agedJob('job_s3', 2, { charge: { free: 1, paid: 0, ref: 'job_s3' } });
    checkVideoTaskStatus.mockResolvedValue({ done: false, progress: 10 });
    expect((await settleJob(job)).status).toBe('processing');
    expect(refundCredits).not.toHaveBeenCalled();
  });
});
