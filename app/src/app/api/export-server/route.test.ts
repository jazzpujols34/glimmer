import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// Mock the KV module before importing anything that (transitively) depends on it.
// Mirrors the pattern in src/app/api/quick-generate/route.test.ts.
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

const ORIGINAL_ENV = { ...process.env };
const CLOUD_RUN_URL = 'https://export.example.com';
const BASE_URL = 'https://glimmer.video';

// CLOUD_RUN_URL is read from process.env at module top-level in route.ts, so it
// must be set BEFORE the route module is first imported. Re-import fresh per
// test via vi.resetModules() so each test controls the env deterministically.
let POST: typeof import('./route').POST;
let createJob: typeof import('@/lib/storage').createJob;
let addCredits: typeof import('@/lib/credits').addCredits;

let lastCloudRunBody: Record<string, unknown> | null;

beforeEach(async () => {
  mockStore.clear();
  lastCloudRunBody = null;
  process.env.EXPORT_SERVICE_URL = CLOUD_RUN_URL;
  process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
  vi.resetModules();
  ({ POST } = await import('./route'));
  ({ createJob } = await import('@/lib/storage'));
  ({ addCredits } = await import('@/lib/credits'));

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (init?.method === 'HEAD') {
      return new Response(null, { status: 200 });
    }
    if (url.startsWith(`${CLOUD_RUN_URL}/export-async`)) {
      lastCloudRunBody = init?.body ? JSON.parse(init.body as string) : null;
      return new Response(JSON.stringify({ exportId: 'exp_test' }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  }));
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function buildRequest(body: Record<string, unknown>, ip = '10.0.0.1'): NextRequest {
  return {
    headers: new Headers({ 'cf-connecting-ip': ip }),
    json: async () => body,
  } as unknown as NextRequest;
}

function clipFor(jobId: string) {
  return {
    sourceUrl: `videos/${jobId}/0.mp4`,
    trimStart: 0,
    trimEnd: 5,
    speed: 1,
    volume: 1,
    filter: null,
  };
}

describe('POST /api/export-server — watermark is computed server-side, not client-trusted', () => {
  it('applies the watermark for a free-tier job even when the client sends watermark:false', async () => {
    const email = 'free-export@example.com';
    await createJob('job_free1', { email });

    const res = await POST(buildRequest({
      jobId: 'job_free1',
      watermark: false, // attacker-controlled — must be ignored
      clips: [clipFor('job_free1')],
      transitions: [],
      subtitles: [],
      musicClips: [],
    }));

    expect(res.status).toBe(200);
    expect(lastCloudRunBody?.watermark).toBe(true);
  });

  it('omits the watermark for a paid job, regardless of the client watermark field', async () => {
    const email = 'paid-export@example.com';
    await createJob('job_paid1', { email });
    await addCredits(email, 20, { id: 'p1', credits: 20, amountTWD: 299, createdAt: new Date().toISOString() });

    const res = await POST(buildRequest({
      jobId: 'job_paid1',
      watermark: true, // irrelevant now — server derives it from the job's owner
      clips: [clipFor('job_paid1')],
      transitions: [],
      subtitles: [],
      musicClips: [],
    }));

    expect(res.status).toBe(200);
    expect(lastCloudRunBody?.watermark).toBe(false);
  });

  it('defaults to applying the watermark when jobId has no matching job (e.g. showcase export)', async () => {
    const res = await POST(buildRequest({
      jobId: 'showcase-12345',
      watermark: false,
      clips: [clipFor('showcase-12345')],
      transitions: [],
      subtitles: [],
      musicClips: [],
    }));

    expect(res.status).toBe(200);
    expect(lastCloudRunBody?.watermark).toBe(true);
  });
});
