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

// Mock the provider dispatcher — we're testing credit/abuse-guard bookkeeping
// around task creation, not the real BytePlus/Veo/Kling HTTP calls.
vi.mock('@/lib/veo', () => ({
  createVideoTask: vi.fn(),
}));

import { POST } from './route';
import { createVideoTask } from '@/lib/veo';
import { checkCredits, consumeCredits, setEmailVerified, addCredits } from '@/lib/credits';
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
  return `10.1.0.${ipCounter}`;
}

const standardSettings: Partial<GenerationSettings> = {
  resolution: '720p',
  videoLength: 5,
  numResults: 1,
};

const nonStandardSettings: Partial<GenerationSettings> = {
  resolution: '1080p',
  videoLength: 12,
  numResults: 4, // creditsForGeneration => 22
};

/** Build a generate NextRequest-like object with 1 dummy photo. */
function buildRequest(opts: {
  email: string;
  settings?: Partial<GenerationSettings>;
  ip?: string;
  headers?: Record<string, string>;
}): NextRequest {
  const formData = new FormData();
  formData.set('email', opts.email);
  formData.set('name', '測試');
  formData.set('occasion', 'memorial');
  if (opts.settings) {
    formData.set('settings', JSON.stringify(opts.settings));
  }
  formData.append('photo_0', new Blob(['a'], { type: 'image/png' }), 'a.png');

  const ip = opts.ip ?? nextIp();
  const headerEntries: Record<string, string> = { ...(opts.headers ?? { 'cf-connecting-ip': ip }) };

  return {
    formData: async () => formData,
    headers: new Headers(headerEntries),
  } as unknown as NextRequest;
}

describe('POST /api/generate — free tier is standard-spec only', () => {
  it('rejects a non-standard-spec generation when paid credits cannot cover it, even though free tier has room', async () => {
    const email = 'spec-only-fail@example.com';
    await setEmailVerified(email);

    const res = await buildAndSend({ email, settings: nonStandardSettings });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('FREE_TIER_STANDARD_SPEC_ONLY');
    expect(body.error).toContain('免費額度僅支援標準規格');
    expect(mockCreateVideoTask).not.toHaveBeenCalled();

    // Nothing was deducted.
    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(0);
    expect(balance.paidUsed).toBe(0);
  });

  it('allows a non-standard-spec generation once paid credits fully cover it — drawn entirely from paid', async () => {
    const email = 'spec-only-ok@example.com';
    await setEmailVerified(email);
    await addCredits(email, 30, {
      id: 'p1', credits: 30, amountTWD: 999, createdAt: new Date().toISOString(),
    });

    const res = await buildAndSend({ email, settings: nonStandardSettings });
    expect(res.status).toBe(200);
    expect(mockCreateVideoTask).toHaveBeenCalledTimes(1);

    const balance = await checkCredits(email);
    expect(balance.paidUsed).toBe(22);
    expect(balance.freeUsed).toBe(0); // never touched
  });

  function buildAndSend(opts: { email: string; settings?: Partial<GenerationSettings> }) {
    return POST(buildRequest(opts));
  }
});

describe('POST /api/generate — per-IP monthly free-tier cap', () => {
  it('rejects a standard-spec generation from an IP that already hit the monthly free cap', async () => {
    const email = 'ip-capped@example.com';
    await setEmailVerified(email);
    const ip = nextIp();

    // Pre-fill the IP's monthly free-tier counter directly (driving this
    // through FREE_IP_MONTHLY_CAP live POST requests on one IP would itself
    // trip the unrelated 5-req/min generate rate limiter first).
    for (let i = 0; i < FREE_IP_MONTHLY_CAP; i++) {
      await recordFreeIpUsage(ip);
    }

    const res = await POST(buildRequest({ email, settings: standardSettings, ip }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('FREE_TIER_IP_CAP');
    expect(body.error).toContain('此網路環境的免費額度已用完');
    expect(mockCreateVideoTask).not.toHaveBeenCalled();

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(0); // this email's free tier was never touched
  });

  it('does not gate a generation once the email\'s free tier is already exhausted, even if the IP is capped', async () => {
    const email = 'free-exhausted-has-paid@example.com';
    await setEmailVerified(email);
    const ip = nextIp();

    // Exhaust this email's own free tier first (each on its own IP so the
    // target IP's counter stays under our direct control below).
    for (let i = 0; i < FREE_GENERATIONS; i++) {
      const res = await POST(buildRequest({ email, settings: standardSettings, ip: nextIp() }));
      expect(res.status).toBe(200);
    }
    await addCredits(email, 5, {
      id: 'p2', credits: 5, amountTWD: 299, createdAt: new Date().toISOString(),
    });

    // Cap this specific IP directly.
    for (let i = 0; i < FREE_IP_MONTHLY_CAP; i++) {
      await recordFreeIpUsage(ip);
    }

    // This email has no free remaining, so the IP cap must not apply — it pays from paid credits.
    const res = await POST(buildRequest({ email, settings: standardSettings, ip }));
    expect(res.status).toBe(200);
  });

  it('never blocks a generation when the client IP is unknown (fail-open)', async () => {
    const email = 'no-ip-header@example.com';
    await setEmailVerified(email);

    const res = await POST(buildRequest({ email, settings: standardSettings, headers: {} }));
    expect(res.status).toBe(200);
  });

  it('increments the per-IP counter only when a free credit is actually consumed, never for paid-only consumption', async () => {
    const ip = nextIp();
    const freeEmail = 'counts-free@example.com';
    await setEmailVerified(freeEmail);
    await POST(buildRequest({ email: freeEmail, settings: standardSettings, ip }));

    const monthKey = new Date().toISOString().slice(0, 7);
    expect(mockStore.get(`freeip:${monthKey}:${ip}`)).toBe('1');

    const paidEmail = 'counts-paid@example.com';
    await setEmailVerified(paidEmail);
    await addCredits(paidEmail, 30, {
      id: 'p3', credits: 30, amountTWD: 999, createdAt: new Date().toISOString(),
    });
    await POST(buildRequest({ email: paidEmail, settings: nonStandardSettings, ip }));

    // Counter unchanged — that request was paid-only (usedFree === 0).
    expect(mockStore.get(`freeip:${monthKey}:${ip}`)).toBe('1');
  });
});

describe('POST /api/generate — IP forensics on job records', () => {
  it('stores the client IP on the created job record', async () => {
    const email = 'ip-forensics@example.com';
    await setEmailVerified(email);
    const ip = '203.0.113.9';

    const res = await POST(buildRequest({ email, settings: standardSettings, ip }));
    expect(res.status).toBe(200);
    const body = await res.json();

    const job = await getJob(body.id);
    expect(job?.ip).toBe(ip);
  });
});

// Sanity check that consumeCredits is actually reachable/imported correctly in this
// test module (guards against a stale import breaking the suite silently).
describe('sanity', () => {
  it('consumeCredits is importable', () => {
    expect(typeof consumeCredits).toBe('function');
  });
});
