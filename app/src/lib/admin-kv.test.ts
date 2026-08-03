import { describe, it, expect, vi } from 'vitest';

vi.mock('./kv', () => ({
  kvListKeys: vi.fn(() => Promise.resolve([])),
}));

import { mapWithConcurrency, ADMIN_KV_FETCH_CONCURRENCY } from './admin-kv';

describe('ADMIN_KV_FETCH_CONCURRENCY', () => {
  it('is a bounded positive number', () => {
    expect(ADMIN_KV_FETCH_CONCURRENCY).toBeGreaterThan(1);
    expect(ADMIN_KV_FETCH_CONCURRENCY).toBeLessThanOrEqual(50);
  });
});

describe('mapWithConcurrency', () => {
  it('returns an empty array for no items without calling the worker', async () => {
    const fn = vi.fn();
    expect(await mapWithConcurrency([], fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('preserves input order even when later items resolve first', async () => {
    const delays = [30, 20, 10, 0];
    const result = await mapWithConcurrency(delays, async (d, i) => {
      await new Promise((r) => setTimeout(r, d));
      return `item-${i}`;
    });
    expect(result).toEqual(['item-0', 'item-1', 'item-2', 'item-3']);
  });

  it('passes both the item and its index to the worker', async () => {
    const seen: Array<[string, number]> = [];
    await mapWithConcurrency(['a', 'b', 'c'], async (item, index) => {
      seen.push([item, index]);
      return item;
    });
    expect(seen).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('visits every item exactly once', async () => {
    const items = Array.from({ length: 200 }, (_, i) => i);
    const result = await mapWithConcurrency(items, async (n) => n * 2);
    expect(result).toHaveLength(200);
    expect(result[0]).toBe(0);
    expect(result[199]).toBe(398);
    expect(new Set(result).size).toBe(200);
  });

  it('never exceeds the concurrency bound', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 100 }, (_, i) => i),
      async (n) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return n;
      },
      5,
    );
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });

  it('actually runs in parallel — 20 slow items under a bound of 10 take ~2 waves, not 20', async () => {
    const start = Date.now();
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      async () => {
        await new Promise((r) => setTimeout(r, 20));
      },
      10,
    );
    // Sequential would be ~400ms; two waves of 10 is ~40ms. Generous ceiling
    // so this asserts the shape, not the timer precision.
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('does not spawn more workers than there are items', async () => {
    let peak = 0;
    let inFlight = 0;
    await mapWithConcurrency(
      [1, 2],
      async (n) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return n;
      },
      25,
    );
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('propagates a worker rejection instead of resolving a partial array', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], async (n) => {
        if (n === 2) throw new Error('kv exploded');
        return n;
      }),
    ).rejects.toThrow('kv exploded');
  });
});
