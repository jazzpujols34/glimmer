/**
 * Shared KV listing helper for /api/admin/* routes. Prod scale is currently
 * ~150 keys total, so a full `list` per prefix per request is fine — this
 * just bounds the worst case so a future spike in keys can never melt an
 * admin route.
 */

import { kvListKeys } from './kv';

export const ADMIN_KV_LIST_LIMIT = 2000;

export interface CappedKeyList {
  keys: string[];
  truncated: boolean;
}

/** List keys for a prefix, capped at ADMIN_KV_LIST_LIMIT. */
export async function listKeysCapped(prefix: string): Promise<CappedKeyList> {
  const keys = await kvListKeys(prefix);
  if (keys.length > ADMIN_KV_LIST_LIMIT) {
    return { keys: keys.slice(0, ADMIN_KV_LIST_LIMIT), truncated: true };
  }
  return { keys, truncated: false };
}

/**
 * How many KV reads an admin route may have in flight at once.
 *
 * The admin routes each hydrate every listed key, and doing that with a plain
 * `for (const key of keys) await kvGet(key)` costs one edge round-trip per key
 * in series — 91 keys at prod scale was ~4.5s of pure waiting, which is what
 * made the dashboard feel like a slow login. Reading them concurrently turns
 * that into a handful of waves.
 *
 * Bounded rather than an unlimited `Promise.all` for the same reason
 * ADMIN_KV_LIST_LIMIT exists: the list cap allows up to 2000 keys, and firing
 * 2000 simultaneous reads from one Worker invocation is its own failure mode.
 */
export const ADMIN_KV_FETCH_CONCURRENCY = 25;

/**
 * Run `fn` over every item with at most `concurrency` calls in flight,
 * returning results in input order. Rejects if any call rejects — a partially
 * hydrated admin view would silently under-report, which is worse than a 500.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = ADMIN_KV_FETCH_CONCURRENCY,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    for (let i = cursor++; i < items.length; i = cursor++) {
      results[i] = await fn(items[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}
