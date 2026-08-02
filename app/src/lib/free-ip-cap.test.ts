import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the KV module before importing the module under test.
const mockStore = new Map<string, string>();

vi.mock('./kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
}));

import { checkFreeIpCap, recordFreeIpUsage, FREE_IP_MONTHLY_CAP } from './free-ip-cap';

beforeEach(() => {
  mockStore.clear();
});

describe('FREE_IP_MONTHLY_CAP', () => {
  it('is 6', () => {
    expect(FREE_IP_MONTHLY_CAP).toBe(6);
  });
});

describe('checkFreeIpCap', () => {
  it('allows a fresh IP with count 0', async () => {
    const result = await checkFreeIpCap('1.2.3.4');
    expect(result).toEqual({ allowed: true, count: 0 });
  });

  it('allows an IP below the cap', async () => {
    for (let i = 0; i < FREE_IP_MONTHLY_CAP - 1; i++) {
      await recordFreeIpUsage('1.2.3.4');
    }
    const result = await checkFreeIpCap('1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(FREE_IP_MONTHLY_CAP - 1);
  });

  it('rejects an IP at exactly the cap', async () => {
    for (let i = 0; i < FREE_IP_MONTHLY_CAP; i++) {
      await recordFreeIpUsage('9.9.9.9');
    }
    const result = await checkFreeIpCap('9.9.9.9');
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(FREE_IP_MONTHLY_CAP);
  });

  it('rejects an IP over the cap', async () => {
    for (let i = 0; i < FREE_IP_MONTHLY_CAP + 3; i++) {
      await recordFreeIpUsage('8.8.8.8');
    }
    const result = await checkFreeIpCap('8.8.8.8');
    expect(result.allowed).toBe(false);
  });

  it('tracks distinct IPs independently', async () => {
    for (let i = 0; i < FREE_IP_MONTHLY_CAP; i++) {
      await recordFreeIpUsage('1.1.1.1');
    }
    const capped = await checkFreeIpCap('1.1.1.1');
    const fresh = await checkFreeIpCap('2.2.2.2');
    expect(capped.allowed).toBe(false);
    expect(fresh.allowed).toBe(true);
  });

  it('fails open on empty IP — never blocks a paying customer path on a missing header', async () => {
    const result = await checkFreeIpCap('');
    expect(result.allowed).toBe(true);
  });

  it('fails open on "unknown" IP (getClientIP\'s fallback value)', async () => {
    const result = await checkFreeIpCap('unknown');
    expect(result.allowed).toBe(true);
  });

  it('recordFreeIpUsage on an empty/unknown IP is a no-op (never creates a shared bucket)', async () => {
    await recordFreeIpUsage('');
    await recordFreeIpUsage('unknown');
    expect(mockStore.size).toBe(0);
  });

  it('KV key includes a YYYY-MM month segment', async () => {
    await recordFreeIpUsage('5.5.5.5');
    const keys = Array.from(mockStore.keys());
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^freeip:\d{4}-\d{2}:5\.5\.5\.5$/);
  });
});

describe('recordFreeIpUsage', () => {
  it('increments the counter across calls', async () => {
    await recordFreeIpUsage('3.3.3.3');
    await recordFreeIpUsage('3.3.3.3');
    await recordFreeIpUsage('3.3.3.3');
    const result = await checkFreeIpCap('3.3.3.3');
    expect(result.count).toBe(3);
  });
});
