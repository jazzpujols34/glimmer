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
import { createProject, createJob, addJobToProject, getJob } from '@/lib/storage';
import type { NextRequest } from 'next/server';

beforeEach(() => {
  mockStore.clear();
  // Phase 2b flag defaults off in every test unless a test opts in explicitly.
  delete process.env.REQUIRE_SESSION_FOR_PAID;
});

function buildDeleteRequest(id: string, email: string): NextRequest {
  const url = new URL(`https://glimmer.video/api/projects/${id}/cleanup?email=${encodeURIComponent(email)}`);
  return {
    url: url.toString(),
    nextUrl: url,
    headers: new Headers(),
  } as unknown as NextRequest;
}

describe('DELETE /api/projects/[id]/cleanup — Phase 2b enforcement (dormant unless REQUIRE_SESSION_FOR_PAID=true)', () => {
  it('flag off: owner can clean up their own project exactly as before, even with a sessionreq entry on file', async () => {
    const email = 'cleanup-flag-off@example.com';
    const project = await createProject('測試專案', email);
    const job = await createJob('job_cleanup_1', { email });
    await addJobToProject(project.id, job.id);
    mockStore.set(`sessionreq:${email}`, '1');

    const res = await DELETE(buildDeleteRequest(project.id, email), { params: Promise.resolve({ id: project.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(1);
    expect(await getJob(job.id)).toBeUndefined();
  });

  it('flag on + sessionreq set + no session: refuses with SESSION_REQUIRED and does NOT delete anything', async () => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'true';
    const email = 'cleanup-flag-on@example.com';
    const project = await createProject('測試專案', email);
    const job = await createJob('job_cleanup_2', { email });
    await addJobToProject(project.id, job.id);
    mockStore.set(`sessionreq:${email}`, '1');

    const res = await DELETE(buildDeleteRequest(project.id, email), { params: Promise.resolve({ id: project.id }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('SESSION_REQUIRED');
    expect(await getJob(job.id)).toBeDefined();
  });
});
