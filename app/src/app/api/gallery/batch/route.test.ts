import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the KV module before importing anything that (transitively) depends on it.
// Mirrors the pattern in src/lib/credits.test.ts / generate/route.test.ts.
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

import { POST } from './route';
import { createJob, getJob } from '@/lib/storage';
import type { NextRequest } from 'next/server';

beforeEach(() => {
  mockStore.clear();
  // Phase 2b flag defaults off in every test unless a test opts in explicitly.
  delete process.env.REQUIRE_SESSION_FOR_PAID;
});

function buildBatchRequest(email: string, body: unknown): NextRequest {
  const url = new URL(`https://glimmer.video/api/gallery/batch?email=${encodeURIComponent(email)}`);
  return {
    url: url.toString(),
    nextUrl: url,
    headers: new Headers(),
    json: async () => body,
  } as unknown as NextRequest;
}

describe('POST /api/gallery/batch — Phase 2b enforcement (dormant unless REQUIRE_SESSION_FOR_PAID=true)', () => {
  it('flag off: owner can batch-delete their own jobs exactly as before, even with a sessionreq entry on file', async () => {
    const email = 'batch-gallery-flag-off@example.com';
    const job = await createJob('job_batch_gallery_1', { email });
    mockStore.set(`sessionreq:${email}`, '1');

    const res = await POST(buildBatchRequest(email, { action: 'delete', jobIds: [job.id] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(1);
    expect(await getJob(job.id)).toBeUndefined();
  });

  it('flag on + sessionreq set + no session: refuses with SESSION_REQUIRED and does NOT delete anything', async () => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'true';
    const email = 'batch-gallery-flag-on@example.com';
    const job = await createJob('job_batch_gallery_2', { email });
    mockStore.set(`sessionreq:${email}`, '1');

    const res = await POST(buildBatchRequest(email, { action: 'delete', jobIds: [job.id] }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('SESSION_REQUIRED');
    expect(await getJob(job.id)).toBeDefined();
  });
});
