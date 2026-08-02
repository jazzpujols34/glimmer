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

import { DELETE } from './route';
import { createJob, getJob } from '@/lib/storage';

beforeEach(() => {
  mockStore.clear();
  // Phase 2b flag defaults off in every test unless a test opts in explicitly.
  delete process.env.REQUIRE_SESSION_FOR_PAID;
});

function buildDeleteRequest(id: string, email: string): Request {
  return {
    url: `https://glimmer.video/api/gallery/${id}?email=${encodeURIComponent(email)}`,
    headers: new Headers(),
  } as unknown as Request;
}

describe('DELETE /api/gallery/[id] — Phase 2b enforcement (dormant unless REQUIRE_SESSION_FOR_PAID=true)', () => {
  it('flag off: owner can delete their own job exactly as before, even with a sessionreq entry on file', async () => {
    const email = 'gallery-flag-off@example.com';
    const job = await createJob('job_gallery_1', { email });
    mockStore.set(`sessionreq:${email}`, '1');

    const res = await DELETE(buildDeleteRequest(job.id, email), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(await getJob(job.id)).toBeUndefined();
  });

  it('flag on + sessionreq set + no session: refuses with SESSION_REQUIRED and does NOT delete the job', async () => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'true';
    const email = 'gallery-flag-on@example.com';
    const job = await createJob('job_gallery_2', { email });
    mockStore.set(`sessionreq:${email}`, '1');

    const res = await DELETE(buildDeleteRequest(job.id, email), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('SESSION_REQUIRED');
    expect(await getJob(job.id)).toBeDefined();
  });

  it('flag on + no sessionreq entry (never signed in): unchanged legacy behavior, deletion proceeds', async () => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'true';
    const email = 'gallery-never-signed-in@example.com';
    const job = await createJob('job_gallery_3', { email });

    const res = await DELETE(buildDeleteRequest(job.id, email), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);
    expect(await getJob(job.id)).toBeUndefined();
  });
});
