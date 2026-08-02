import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// Mock the KV module before importing anything that (transitively) depends on it.
// Mirrors the pattern in src/lib/credits.test.ts and quick-generate/route.test.ts.
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

vi.mock('@/lib/veo', () => ({
  createVideoTask: vi.fn(),
}));

import { POST } from './route';
import { createVideoTask } from '@/lib/veo';
import { checkCredits, setEmailVerified, addCredits } from '@/lib/credits';
import { recordFreeIpUsage, FREE_IP_MONTHLY_CAP } from '@/lib/free-ip-cap';
import { getJob } from '@/lib/storage';
import { FREE_GENERATIONS } from '@/types';
import type { GenerationSettings } from '@/types';

const mockCreateVideoTask = vi.mocked(createVideoTask);

beforeEach(() => {
  mockStore.clear();
  mockCreateVideoTask.mockReset();
  mockCreateVideoTask.mockResolvedValue({
    provider: 'byteplus',
    externalTaskIds: ['task_1'],
  });
});

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.2.0.${ipCounter}`;
}

const standardSettings: Partial<GenerationSettings> = {
  resolution: '720p',
  videoLength: 5,
};

// perSegmentCost forced numResults=1 by the route — 1080p/12s -> 6 credits/segment
const nonStandardSettings: Partial<GenerationSettings> = {
  resolution: '1080p',
  videoLength: 12,
};

/** Build a generate-batch NextRequest-like object with `photoCount` dummy photos. */
function buildRequest(opts: {
  email: string;
  settings?: Partial<GenerationSettings>;
  photoCount?: number;
  ip?: string;
}): NextRequest {
  const formData = new FormData();
  formData.set('email', opts.email);
  formData.set('name', '測試');
  formData.set('occasion', 'memorial');
  if (opts.settings) {
    formData.set('settings', JSON.stringify(opts.settings));
  }
  const photoCount = opts.photoCount ?? 2;
  for (let i = 0; i < photoCount; i++) {
    formData.append(`photo_${i}`, new Blob(['a'], { type: 'image/png' }), `${i}.png`);
  }

  const ip = opts.ip ?? nextIp();
  return {
    formData: async () => formData,
    headers: new Headers({ 'cf-connecting-ip': ip }),
  } as unknown as NextRequest;
}

describe('POST /api/generate-batch — free tier is standard-spec only', () => {
  it('rejects when paid alone cannot cover the total non-standard-spec cost, even though free+paid combined could', async () => {
    const email = 'batch-spec-fail@example.com';
    await setEmailVerified(email);
    await addCredits(email, 5, { id: 'p1', credits: 5, amountTWD: 299, createdAt: new Date().toISOString() });
    // 2 photos = 1 segment, perSegmentCost = 6 (1080p/12s/x1). paid(5) < totalCost(6),
    // even though free(3) + paid(5) = 8 >= 6.
    const res = await POST(buildRequest({ email, settings: nonStandardSettings, photoCount: 2 }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('FREE_TIER_STANDARD_SPEC_ONLY');
    expect(mockCreateVideoTask).not.toHaveBeenCalled();

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(0);
    expect(balance.paidUsed).toBe(0);
  });

  it('succeeds when paid alone covers the total non-standard-spec cost — drawn entirely from paid', async () => {
    const email = 'batch-spec-ok@example.com';
    await setEmailVerified(email);
    await addCredits(email, 20, { id: 'p2', credits: 20, amountTWD: 999, createdAt: new Date().toISOString() });

    const res = await POST(buildRequest({ email, settings: nonStandardSettings, photoCount: 2 }));
    expect(res.status).toBe(200);
    expect(mockCreateVideoTask).toHaveBeenCalledTimes(1);

    const balance = await checkCredits(email);
    expect(balance.paidUsed).toBe(6);
    expect(balance.freeUsed).toBe(0);
  });
});

describe('POST /api/generate-batch — per-IP monthly free-tier cap', () => {
  it('rejects a standard-spec batch from an IP that already hit the monthly free cap, when the user has no paid credits', async () => {
    const email = 'batch-ip-capped@example.com';
    await setEmailVerified(email);
    const ip = nextIp();
    for (let i = 0; i < FREE_IP_MONTHLY_CAP; i++) {
      await recordFreeIpUsage(ip);
    }

    const res = await POST(buildRequest({ email, settings: standardSettings, photoCount: 2, ip }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('FREE_TIER_IP_CAP');
    expect(mockCreateVideoTask).not.toHaveBeenCalled();
  });

  it('allows a standard-spec batch from a capped IP when paid credits cover the total cost', async () => {
    const email = 'batch-ip-capped-but-paid@example.com';
    await setEmailVerified(email);
    await addCredits(email, 5, { id: 'p-cap-bypass', credits: 5, amountTWD: 299, createdAt: new Date().toISOString() });
    const ip = nextIp();
    for (let i = 0; i < FREE_IP_MONTHLY_CAP; i++) {
      await recordFreeIpUsage(ip);
    }

    // 2 photos = 1 segment, totalCost = 1 — paid(5) covers it, but consumeCredits
    // still draws free-first for amount === 1.
    const res = await POST(buildRequest({ email, settings: standardSettings, photoCount: 2, ip }));
    expect(res.status).toBe(200);
    expect(mockCreateVideoTask).toHaveBeenCalledTimes(1);

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(1);
    expect(balance.paidUsed).toBe(0);

    const monthKey = new Date().toISOString().slice(0, 7);
    expect(mockStore.get(`freeip:${monthKey}:${ip}`)).toBe(String(FREE_IP_MONTHLY_CAP + 1));
  });

  it('does not gate a batch once the email\'s free tier is already exhausted, even if the IP is capped', async () => {
    const email = 'batch-free-exhausted@example.com';
    await setEmailVerified(email);
    const ip = nextIp();

    for (let i = 0; i < FREE_GENERATIONS; i++) {
      const res = await POST(buildRequest({ email, settings: standardSettings, photoCount: 2, ip: nextIp() }));
      expect(res.status).toBe(200);
    }
    await addCredits(email, 5, { id: 'p3', credits: 5, amountTWD: 299, createdAt: new Date().toISOString() });

    for (let i = 0; i < FREE_IP_MONTHLY_CAP; i++) {
      await recordFreeIpUsage(ip);
    }

    const res = await POST(buildRequest({ email, settings: standardSettings, photoCount: 2, ip }));
    expect(res.status).toBe(200);
  });

  it('never blocks a batch when the client IP is unknown (fail-open)', async () => {
    const email = 'batch-no-ip@example.com';
    await setEmailVerified(email);

    const req = {
      formData: async () => {
        const fd = new FormData();
        fd.set('email', email);
        fd.set('name', '測試');
        fd.set('occasion', 'memorial');
        fd.set('settings', JSON.stringify(standardSettings));
        fd.append('photo_0', new Blob(['a'], { type: 'image/png' }), '0.png');
        fd.append('photo_1', new Blob(['a'], { type: 'image/png' }), '1.png');
        return fd;
      },
      headers: new Headers(),
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('increments the per-IP counter once per segment that actually consumes a free credit', async () => {
    const email = 'batch-counts-free@example.com';
    await setEmailVerified(email);
    const ip = nextIp();

    // 3 photos = 2 segments, both standard-spec (perSegmentCost === 1).
    const res = await POST(buildRequest({ email, settings: standardSettings, photoCount: 3, ip }));
    expect(res.status).toBe(200);

    const monthKey = new Date().toISOString().slice(0, 7);
    expect(mockStore.get(`freeip:${monthKey}:${ip}`)).toBe('2');
  });

  it('does not increment the per-IP counter for a paid-only (non-standard-spec) batch', async () => {
    const email = 'batch-counts-paid@example.com';
    await setEmailVerified(email);
    await addCredits(email, 20, { id: 'p4', credits: 20, amountTWD: 999, createdAt: new Date().toISOString() });
    const ip = nextIp();

    const res = await POST(buildRequest({ email, settings: nonStandardSettings, photoCount: 2, ip }));
    expect(res.status).toBe(200);

    const monthKey = new Date().toISOString().slice(0, 7);
    expect(mockStore.get(`freeip:${monthKey}:${ip}`)).toBeUndefined();
  });
});

describe('POST /api/generate-batch — IP forensics on job records', () => {
  it('stores the client IP on every segment job record', async () => {
    const email = 'batch-ip-forensics@example.com';
    await setEmailVerified(email);
    const ip = '203.0.113.10';

    const res = await POST(buildRequest({ email, settings: standardSettings, photoCount: 3, ip }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.segmentJobIds).toHaveLength(2);

    for (const jobId of body.segmentJobIds) {
      const job = await getJob(jobId);
      expect(job?.ip).toBe(ip);
    }
  });
});
