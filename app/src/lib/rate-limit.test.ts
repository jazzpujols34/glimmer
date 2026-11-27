import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type FakeKV = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

const state: { kv: FakeKV | null } = { kv: null };

vi.mock('./kv', () => ({
  getKV: vi.fn(() => Promise.resolve(state.kv)),
}));

import { checkRateLimit, getClientIP } from './rate-limit';

// 2026-01-01T00:00:00Z is 1767225600 s, divisible by 60.
const T0 = 1767225600;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 * 1000 + 5000); // 5s into a window
  state.kv = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkRateLimit (in-memory fallback)', () => {
  it('allows under the limit and counts down remaining', async () => {
    const r1 = await checkRateLimit('mem-under', 3, 60);
    expect(r1).toEqual({ allowed: true, remaining: 2, resetAt: T0 + 60 });
    const r2 = await checkRateLimit('mem-under', 3, 60);
    expect(r2).toEqual({ allowed: true, remaining: 1, resetAt: T0 + 60 });
    const r3 = await checkRateLimit('mem-under', 3, 60);
    expect(r3).toEqual({ allowed: true, remaining: 0, resetAt: T0 + 60 });
  });

  it('blocks once the limit is exceeded', async () => {
    await checkRateLimit('mem-over', 2, 60);
    await checkRateLimit('mem-over', 2, 60);
    const r = await checkRateLimit('mem-over', 2, 60);
    expect(r).toEqual({ allowed: false, remaining: 0, resetAt: T0 + 60 });
  });

  it('resets in the next window', async () => {
    await checkRateLimit('mem-reset', 1, 60);
    expect((await checkRateLimit('mem-reset', 1, 60)).allowed).toBe(false);
    vi.setSystemTime((T0 + 60) * 1000 + 1000);
    const r = await checkRateLimit('mem-reset', 1, 60);
    expect(r).toEqual({ allowed: true, remaining: 0, resetAt: T0 + 120 });
  });

  it('tracks identifiers independently', async () => {
    await checkRateLimit('mem-a', 1, 60);
    expect((await checkRateLimit('mem-a', 1, 60)).allowed).toBe(false);
    expect((await checkRateLimit('mem-b', 1, 60)).allowed).toBe(true);
  });

  it('defaults to 20 requests per 60 seconds', async () => {
    const first = await checkRateLimit('mem-default');
    expect(first).toEqual({ allowed: true, remaining: 19, resetAt: T0 + 60 });
    for (let i = 0; i < 19; i++) await checkRateLimit('mem-default');
    expect((await checkRateLimit('mem-default')).allowed).toBe(false);
  });
});

describe('checkRateLimit (fake KV)', () => {
  function makeKV(initial: Record<string, string> = {}): FakeKV {
    const store = new Map(Object.entries(initial));
    return {
      get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      put: vi.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve();
      }),
    };
  }

  it('writes count 1 with a 2x-window TTL on the first request', async () => {
    state.kv = makeKV();
    const r = await checkRateLimit('kv-first', 5, 60);
    expect(r).toEqual({ allowed: true, remaining: 4, resetAt: T0 + 60 });
    expect(state.kv.put).toHaveBeenCalledWith(`rl:kv-first:${T0}`, '1', { expirationTtl: 120 });
  });

  it('increments an existing counter', async () => {
    state.kv = makeKV({ [`rl:kv-inc:${T0}`]: '2' });
    const r = await checkRateLimit('kv-inc', 5, 60);
    expect(r).toEqual({ allowed: true, remaining: 2, resetAt: T0 + 60 });
    expect(state.kv.put).toHaveBeenCalledWith(`rl:kv-inc:${T0}`, '3', { expirationTtl: 120 });
  });

  it('blocks at the limit without writing', async () => {
    state.kv = makeKV({ [`rl:kv-full:${T0}`]: '5' });
    const r = await checkRateLimit('kv-full', 5, 60);
    expect(r).toEqual({ allowed: false, remaining: 0, resetAt: T0 + 60 });
    expect(state.kv.put).not.toHaveBeenCalled();
  });

  it('uses a new key in the next window, so the count resets', async () => {
    state.kv = makeKV({ [`rl:kv-win:${T0}`]: '5' });
    vi.setSystemTime((T0 + 60) * 1000);
    const r = await checkRateLimit('kv-win', 5, 60);
    expect(r).toEqual({ allowed: true, remaining: 4, resetAt: T0 + 120 });
    expect(state.kv.get).toHaveBeenCalledWith(`rl:kv-win:${T0 + 60}`);
  });
});

describe('getClientIP', () => {
  const req = (headers: Record<string, string>) => new Request('https://example.com', { headers });

  it('prefers cf-connecting-ip over the others', () => {
    expect(
      getClientIP(req({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2', 'x-real-ip': '3.3.3.3' })),
    ).toBe('1.1.1.1');
  });

  it('uses the first x-forwarded-for entry, trimmed, when no cf header', () => {
    expect(getClientIP(req({ 'x-forwarded-for': ' 2.2.2.2 , 9.9.9.9', 'x-real-ip': '3.3.3.3' }))).toBe('2.2.2.2');
  });

  it('falls back to x-real-ip', () => {
    expect(getClientIP(req({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
  });

  it('returns unknown when no header is present', () => {
    expect(getClientIP(req({}))).toBe('unknown');
  });
});
