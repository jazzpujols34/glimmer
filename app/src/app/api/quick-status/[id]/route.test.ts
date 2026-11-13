import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// Mock the KV module before importing anything that (transitively) depends on it.
// Mirrors the pattern in src/lib/storage.test.ts.
const mockStore = new Map<string, string>();

vi.mock('@/lib/kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  kvDelete: vi.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
  kvListKeys: vi.fn((prefix: string) =>
    Promise.resolve(Array.from(mockStore.keys()).filter(k => k.startsWith(prefix)))
  ),
  getKV: vi.fn(() => Promise.resolve(null)),
}));

// The route reads this at module load.
vi.hoisted(() => {
  process.env.EXPORT_SERVICE_URL = 'https://export.test';
});

import { GET } from './route';
import { createBatch, addSegmentToBatch, createJob, updateJob, createQuickJob, updateQuickJob, getQuickJob } from '@/lib/storage';
import { defaultSettings } from '@/types';

beforeEach(() => {
  mockStore.clear();
});

function buildRequest(quickId: string, email?: string): NextRequest {
  const url = `http://localhost/api/quick-status/${quickId}${email ? `?email=${encodeURIComponent(email)}` : ''}`;
  return {
    url,
    headers: new Headers({ 'cf-connecting-ip': '10.0.0.1' }),
  } as unknown as NextRequest;
}

// Batch still 'processing' (no completed segments) so the route doesn't try to
// kick off a Cloud Run export — we're only exercising the name-gating logic.
async function makeQuickJob(email: string) {
  const batch = await createBatch('爺爺的追思影片', email, 'memorial', defaultSettings, 1, 'proj_1');
  await createJob('job_seg1', { email });
  await updateJob('job_seg1', { status: 'processing', progress: 40 });
  await addSegmentToBatch(batch.id, 'job_seg1');
  return createQuickJob(email, 'memorial-gentle', '爺爺', batch.id, '2026-01-01', '想念您');
}

describe('GET /api/quick-status/[id] — name is owner-gated PII', () => {
  it('omits the deceased name for an anonymous poller, but still returns generation progress', async () => {
    const quickJob = await makeQuickJob('owner@example.com');

    const res = await GET(buildRequest(quickJob.id), { params: Promise.resolve({ id: quickJob.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.name).toBeUndefined();
    expect(body.generationProgress).toBeDefined();
    expect(body.segments).toHaveLength(1);
  });

  it('returns the full payload including name for the owner', async () => {
    const quickJob = await makeQuickJob('owner@example.com');

    const res = await GET(buildRequest(quickJob.id, 'owner@example.com'), { params: Promise.resolve({ id: quickJob.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.name).toBe('爺爺');
  });

  it('omits the deceased name for a non-owner-supplied email', async () => {
    const quickJob = await makeQuickJob('owner@example.com');

    const res = await GET(buildRequest(quickJob.id, 'stranger@example.com'), { params: Promise.resolve({ id: quickJob.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.name).toBeUndefined();
  });
});

describe('GET /api/quick-status/[id] — the quick job reaches an end state', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const call = (id: string) => GET(buildRequest(id), { params: Promise.resolve({ id }) });

  it('marks the job complete when the export service reports the finished file', async () => {
    const quickJob = await makeQuickJob('owner@example.com');
    await updateQuickJob(quickJob.id, { status: 'exporting', exportId: 'exp_1' });
    // Exact shape of ExportStatusResponse in cloud-run/export-service/main.py
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ exportId: 'exp_1', status: 'complete', r2Key: 'exports/sb/exp_1.mp4' })))
    ) as typeof fetch;

    const body = await (await call(quickJob.id)).json();

    expect(body.status).toBe('complete');
    expect(body.videoUrl).toContain('/api/proxy-r2?key=exports%2Fsb%2Fexp_1.mp4');
    expect((await getQuickJob(quickJob.id))?.videoR2Key).toBe('exports/sb/exp_1.mp4');
  });

  it('starts the export once every segment that exists has settled, even if fewer were created than planned', async () => {
    // Planned 3 segments, but only one was ever created (e.g. credits ran out mid-loop).
    const batch = await createBatch('爺爺', 'owner@example.com', 'memorial', defaultSettings, 3, 'proj_1');
    await createJob('job_only', { email: 'owner@example.com' });
    await updateJob('job_only', { status: 'processing' });
    await updateJob('job_only', { status: 'complete', videoUrl: 'videos/job_only/0.mp4', videoUrls: ['videos/job_only/0.mp4'] });
    await addSegmentToBatch(batch.id, 'job_only');
    const quickJob = await createQuickJob('owner@example.com', 'memorial-gentle', '爺爺', batch.id);
    const fetchMock = vi.fn((_url: string) => Promise.resolve(new Response(JSON.stringify({ exportId: 'exp_2', status: 'processing' }))));
    globalThis.fetch = fetchMock as typeof fetch;

    const body = await (await call(quickJob.id)).json();

    expect(body.status).toBe('exporting');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://export.test/export-async');
  });

  it('ends in error, not an endless wait, when no segment was ever created', async () => {
    const batch = await createBatch('爺爺', 'owner@example.com', 'memorial', defaultSettings, 2, 'proj_1');
    const quickJob = await createQuickJob('owner@example.com', 'memorial-gentle', '爺爺', batch.id);

    const body = await (await call(quickJob.id)).json();

    expect(body.status).toBe('error');
  });
});
