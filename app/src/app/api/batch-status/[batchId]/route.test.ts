import { describe, it, expect, beforeEach, vi } from 'vitest';
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

import { GET } from './route';
import { createBatch, addSegmentToBatch, createJob, updateJob } from '@/lib/storage';
import { defaultSettings } from '@/types';

beforeEach(() => {
  mockStore.clear();
});

function buildRequest(batchId: string, email?: string): NextRequest {
  const url = `http://localhost/api/batch-status/${batchId}${email ? `?email=${encodeURIComponent(email)}` : ''}`;
  return {
    url,
    headers: new Headers({ 'cf-connecting-ip': '10.0.0.1' }),
  } as unknown as NextRequest;
}

async function makeCompleteBatch(email: string) {
  const batch = await createBatch('阿嬤追思影片', email, 'memorial', defaultSettings, 1, 'proj_1');
  await createJob('job_seg1', { email });
  await updateJob('job_seg1', {
    status: 'complete',
    progress: 100,
    videoUrl: 'videos/job_seg1/0.mp4',
    videoUrls: ['videos/job_seg1/0.mp4'],
  });
  await addSegmentToBatch(batch.id, 'job_seg1');
  return batch;
}

describe('GET /api/batch-status/[batchId] — name is owner-gated PII', () => {
  it('omits the batch name for an anonymous poller, but still returns progress/video', async () => {
    const batch = await makeCompleteBatch('owner@example.com');

    const res = await GET(buildRequest(batch.id), { params: Promise.resolve({ batchId: batch.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.name).toBeUndefined();
    expect(body.segments).toHaveLength(1);
    expect(body.segments[0].status).toBe('complete');
    expect(body.segments[0].videoUrl).toBeTruthy();
  });

  it('returns the full payload including name for the owner', async () => {
    const batch = await makeCompleteBatch('owner@example.com');

    const res = await GET(buildRequest(batch.id, 'owner@example.com'), { params: Promise.resolve({ batchId: batch.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.name).toBe('阿嬤追思影片');
  });

  it('omits the batch name for a non-owner-supplied email', async () => {
    const batch = await makeCompleteBatch('owner@example.com');

    const res = await GET(buildRequest(batch.id, 'stranger@example.com'), { params: Promise.resolve({ batchId: batch.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.name).toBeUndefined();
  });
});
