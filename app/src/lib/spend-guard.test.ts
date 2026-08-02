import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the KV module before importing spend-guard — same pattern as credits.test.ts
const mockStore = new Map<string, string>();
const putCalls: { key: string; value: string; opts?: { expirationTtl?: number } }[] = [];

vi.mock('./kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string, opts?: { expirationTtl?: number }) => {
    mockStore.set(key, value);
    putCalls.push({ key, value, opts });
    return Promise.resolve();
  }),
}));

import { estimatedTokensForGeneration, checkDailySpendCap, recordProviderSpend } from './spend-guard';
import { defaultSettings } from '@/types';
import type { GenerationSettings } from '@/types';

const ORIGINAL_CAP = process.env.DAILY_PROVIDER_TOKEN_CAP;

beforeEach(() => {
  mockStore.clear();
  putCalls.length = 0;
  delete process.env.DAILY_PROVIDER_TOKEN_CAP;
});

afterEach(() => {
  if (ORIGINAL_CAP === undefined) {
    delete process.env.DAILY_PROVIDER_TOKEN_CAP;
  } else {
    process.env.DAILY_PROVIDER_TOKEN_CAP = ORIGINAL_CAP;
  }
});

describe('estimatedTokensForGeneration', () => {
  it('720p / 5s / x1 estimates 108,000 tokens', () => {
    expect(
      estimatedTokensForGeneration({ ...defaultSettings, resolution: '720p', videoLength: 5, numResults: 1 })
    ).toBe(108000);
  });

  it('1080p / 12s / x1 estimates 583,200 tokens (predicted formula — provider measured 585,225 separately)', () => {
    expect(
      estimatedTokensForGeneration({ ...defaultSettings, resolution: '1080p', videoLength: 12, numResults: 1 })
    ).toBe(583200);
  });

  it('scales linearly with numResults', () => {
    const one = estimatedTokensForGeneration({ ...defaultSettings, resolution: '720p', videoLength: 5, numResults: 1 });
    const four = estimatedTokensForGeneration({ ...defaultSettings, resolution: '720p', videoLength: 5, numResults: 4 });
    expect(four).toBe(one * 4);
  });

  it('defaultSettings estimate matches the 720p/5s/x1 base case', () => {
    expect(estimatedTokensForGeneration(defaultSettings)).toBe(108000);
  });

  it('unknown resolution falls back to 720p pixels (shares credit-cost.ts fallback)', () => {
    const settings = { ...defaultSettings, resolution: '4k' as unknown as GenerationSettings['resolution'], videoLength: 5, numResults: 1 };
    expect(estimatedTokensForGeneration(settings)).toBe(108000);
  });

  it('never returns 0, NaN, or negative for a fully empty settings object', () => {
    const result = estimatedTokensForGeneration({} as GenerationSettings);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });
});

describe('checkDailySpendCap', () => {
  it('defaults to a 15,000,000 token cap when DAILY_PROVIDER_TOKEN_CAP is unset', async () => {
    const result = await checkDailySpendCap();
    expect(result).toEqual({ capped: false, cap: 15000000, spent: 0 });
  });

  it('is not capped when spend is below the configured cap', async () => {
    process.env.DAILY_PROVIDER_TOKEN_CAP = '1000';
    await recordProviderSpend(999);
    const result = await checkDailySpendCap();
    expect(result).toEqual({ capped: false, cap: 1000, spent: 999 });
  });

  it('is capped once recorded spend reaches the configured cap', async () => {
    process.env.DAILY_PROVIDER_TOKEN_CAP = '1000';
    await recordProviderSpend(1000);
    const result = await checkDailySpendCap();
    expect(result.capped).toBe(true);
    expect(result.spent).toBe(1000);
  });

  it('is capped once recorded spend exceeds the configured cap', async () => {
    process.env.DAILY_PROVIDER_TOKEN_CAP = '1000';
    await recordProviderSpend(1500);
    const result = await checkDailySpendCap();
    expect(result.capped).toBe(true);
  });

  it('"0" disables the cap regardless of accumulated spend', async () => {
    process.env.DAILY_PROVIDER_TOKEN_CAP = '0';
    await recordProviderSpend(999999999);
    const result = await checkDailySpendCap();
    expect(result).toEqual({ capped: false, cap: 0, spent: 0 });
  });

  it('falls back to the default cap for a non-numeric env value', async () => {
    process.env.DAILY_PROVIDER_TOKEN_CAP = 'not-a-number';
    const result = await checkDailySpendCap();
    expect(result.cap).toBe(15000000);
  });
});

describe('recordProviderSpend', () => {
  it('accumulates across multiple calls for the same UTC day', async () => {
    await recordProviderSpend(100);
    await recordProviderSpend(250);
    const result = await checkDailySpendCap();
    expect(result.spent).toBe(350);
  });

  it('writes to KV under a spend:YYYY-MM-DD (UTC) key with a 172800s TTL', async () => {
    await recordProviderSpend(42);
    const todayUTC = new Date().toISOString().slice(0, 10);
    expect(putCalls.length).toBeGreaterThan(0);
    const last = putCalls[putCalls.length - 1];
    expect(last.key).toBe(`spend:${todayUTC}`);
    expect(last.opts?.expirationTtl).toBe(172800);
  });

  it('ignores zero and negative token amounts', async () => {
    await recordProviderSpend(0);
    await recordProviderSpend(-5);
    const result = await checkDailySpendCap();
    expect(result.spent).toBe(0);
    expect(putCalls.length).toBe(0);
  });
});
