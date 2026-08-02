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
