import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// Mock the KV module before importing anything that (transitively) depends on it.
// Mirrors the pattern in src/lib/credits.test.ts and webhooks/ecpay/route.test.ts.
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

// Mock the provider dispatcher — we're testing credit bookkeeping around task
// creation, not the real BytePlus/Veo/Kling HTTP calls.
vi.mock('@/lib/veo', () => ({
  createVideoTask: vi.fn(),
}));

import { POST } from './route';
import { createVideoTask } from '@/lib/veo';
import { checkCredits, setEmailVerified, addCredits } from '@/lib/credits';
import { recordFreeIpUsage, FREE_IP_MONTHLY_CAP } from '@/lib/free-ip-cap';
import { getJob } from '@/lib/storage';
import { FREE_GENERATIONS } from '@/types';

const mockCreateVideoTask = vi.mocked(createVideoTask);

beforeEach(() => {
  mockStore.clear();
  mockCreateVideoTask.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

let ipCounter = 0;

/** Build a quick-generate NextRequest-like object with 2 dummy photos. */
function buildRequest(
  email: string,
  overrides: Partial<Record<string, string>> = {},
  opts: { ip?: string; noIpHeader?: boolean } = {},
): NextRequest {
  ipCounter += 1;
  const formData = new FormData();
  formData.set('email', overrides.email ?? email);
  formData.set('templateId', overrides.templateId ?? 'memorial-gentle');
  formData.set('name', overrides.name ?? '測試');
  formData.set('occasion', overrides.occasion ?? 'memorial');
  formData.append('photos', new Blob(['a'], { type: 'image/png' }), 'a.png');
  formData.append('photos', new Blob(['b'], { type: 'image/png' }), 'b.png');

  const headers = opts.noIpHeader
    ? new Headers()
    : new Headers({ 'cf-connecting-ip': opts.ip ?? `10.0.0.${ipCounter}` });

  return {
    formData: async () => formData,
    headers,
  } as unknown as NextRequest;
}

describe('POST /api/quick-generate — credit refund on task-creation failure', () => {
  it('refunds the exact consumed amount when createVideoTask throws — balance unchanged', async () => {
    const email = 'refund-quickgen@example.com';
    await setEmailVerified(email);
    mockCreateVideoTask.mockRejectedValue(new Error('BytePlus create failed: 500'));

    const before = await checkCredits(email);
    expect(before.remaining).toBe(FREE_GENERATIONS);

    const res = await POST(buildRequest(email));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.startedSegments).toBe(0);
    expect(body.totalSegments).toBe(1);

    // The one segment failed after consumeCredits() ran — refund must have
    // reversed it exactly, leaving the balance untouched.
    const after = await checkCredits(email);
    expect(after.remaining).toBe(FREE_GENERATIONS);
    expect(after.freeUsed).toBe(0);
    expect(after.paidUsed).toBe(0);
  });

  it('happy path still deducts credit normally when createVideoTask succeeds', async () => {
    const email = 'happy-quickgen@example.com';
    await setEmailVerified(email);
    mockCreateVideoTask.mockResolvedValue({
      provider: 'byteplus',
      externalTaskIds: ['task_1'],
    });

    const res = await POST(buildRequest(email));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.startedSegments).toBe(1);

    const after = await checkCredits(email);
    expect(after.remaining).toBe(FREE_GENERATIONS - 1);
    expect(after.freeUsed).toBe(1);
  });
});

describe('POST /api/quick-generate — daily provider-spend circuit breaker', () => {
  const ORIGINAL_CAP = process.env.DAILY_PROVIDER_TOKEN_CAP;

  afterEach(() => {
    if (ORIGINAL_CAP === undefined) delete process.env.DAILY_PROVIDER_TOKEN_CAP;
    else process.env.DAILY_PROVIDER_TOKEN_CAP = ORIGINAL_CAP;
  });

  it('returns 503 with the zh-TW cap message and creates no task when today\'s cap is already reached', async () => {
    process.env.DAILY_PROVIDER_TOKEN_CAP = '1'; // any real request exceeds this
    const email = 'capped-quickgen@example.com';
    await setEmailVerified(email);
    // Pre-fill today's spend counter over the cap via the KV mock directly.
    const todayKey = `spend:${new Date().toISOString().slice(0, 10)}`;
    mockStore.set(todayKey, '999999');

    const res = await POST(buildRequest(email));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('今日系統生成額度已滿，請稍後或明日再試');
    expect(mockCreateVideoTask).not.toHaveBeenCalled();

    // No credit should have been touched either — request was rejected before the loop.
    const after = await checkCredits(email);
    expect(after.remaining).toBe(FREE_GENERATIONS);
  });
});

describe('POST /api/quick-generate — per-IP monthly free-tier cap', () => {
  it('rejects a quick-generate request from an IP that already hit the monthly free cap, when the user has no paid credits', async () => {
    const email = 'quick-ip-capped@example.com';
    await setEmailVerified(email);
    const ip = '10.9.0.1';
    for (let i = 0; i < FREE_IP_MONTHLY_CAP; i++) {
      await recordFreeIpUsage(ip);
    }

    const res = await POST(buildRequest(email, {}, { ip }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('FREE_TIER_IP_CAP');
    expect(body.error).toContain('此網路環境的免費額度已用完');
    expect(mockCreateVideoTask).not.toHaveBeenCalled();

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(0);
  });

  it('allows a quick-generate request from a capped IP when paid credits cover the total cost', async () => {
    const email = 'quick-ip-capped-but-paid@example.com';
    await setEmailVerified(email);
    mockCreateVideoTask.mockResolvedValue({ provider: 'byteplus', externalTaskIds: ['task_1'] });
    await addCredits(email, 5, { id: 'p-cap-bypass', credits: 5, amountTWD: 299, createdAt: new Date().toISOString() });
    const ip = '10.9.0.4';
    for (let i = 0; i < FREE_IP_MONTHLY_CAP; i++) {
      await recordFreeIpUsage(ip);
    }

    const res = await POST(buildRequest(email, {}, { ip }));
    expect(res.status).toBe(200);

    // consumeCredits still draws free-first for amount === 1.
    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(1);
    expect(balance.paidUsed).toBe(0);

    const monthKey = new Date().toISOString().slice(0, 7);
    expect(mockStore.get(`freeip:${monthKey}:${ip}`)).toBe(String(FREE_IP_MONTHLY_CAP + 1));
  });

  it('does not gate once the email\'s free tier is already exhausted, even if the IP is capped', async () => {
    const email = 'quick-free-exhausted@example.com';
    await setEmailVerified(email);
    mockCreateVideoTask.mockResolvedValue({ provider: 'byteplus', externalTaskIds: ['task_1'] });

    // Exhaust this email's free tier (1 credit per quick-generate call, 2 photos = 1 segment).
    for (let i = 0; i < FREE_GENERATIONS; i++) {
      const res = await POST(buildRequest(email));
      expect(res.status).toBe(200);
    }
    await addCredits(email, 5, { id: 'p1', credits: 5, amountTWD: 299, createdAt: new Date().toISOString() });

    const ip = '10.9.0.2';
    for (let i = 0; i < FREE_IP_MONTHLY_CAP; i++) {
      await recordFreeIpUsage(ip);
    }

    const res = await POST(buildRequest(email, {}, { ip }));
    expect(res.status).toBe(200);
  });

  it('never blocks a request when the client IP is unknown (fail-open)', async () => {
    const email = 'quick-no-ip@example.com';
    await setEmailVerified(email);
    mockCreateVideoTask.mockResolvedValue({ provider: 'byteplus', externalTaskIds: ['task_1'] });

    const res = await POST(buildRequest(email, {}, { noIpHeader: true }));
    expect(res.status).toBe(200);
  });

  it('increments the per-IP counter only when a free credit is actually consumed', async () => {
    const email = 'quick-counts-free@example.com';
    await setEmailVerified(email);
    mockCreateVideoTask.mockResolvedValue({ provider: 'byteplus', externalTaskIds: ['task_1'] });
    const ip = '10.9.0.3';

    const res = await POST(buildRequest(email, {}, { ip }));
    expect(res.status).toBe(200);

    const monthKey = new Date().toISOString().slice(0, 7);
    expect(mockStore.get(`freeip:${monthKey}:${ip}`)).toBe('1');
  });
});

describe('POST /api/quick-generate — IP forensics on job records', () => {
  it('stores the client IP on the created segment job record', async () => {
    const email = 'quick-ip-forensics@example.com';
    await setEmailVerified(email);
    mockCreateVideoTask.mockResolvedValue({ provider: 'byteplus', externalTaskIds: ['task_1'] });
    const ip = '203.0.113.11';

    const res = await POST(buildRequest(email, {}, { ip }));
    expect(res.status).toBe(200);

    const jobKeys = Array.from(mockStore.keys()).filter(k => k.startsWith('job:'));
    expect(jobKeys.length).toBeGreaterThan(0);
    const job = await getJob(jobKeys[0].replace('job:', ''));
    expect(job?.ip).toBe(ip);
  });
});
