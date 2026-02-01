/**
 * Shared KV abstraction: Cloudflare KV when deployed, in-memory Map for local dev.
 * Used by storage.ts (jobs) and credits.ts (credit system).
 */

// --- KV access (Cloudflare Pages) ---

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

async function getKV(): Promise<KVNamespaceLike | null> {
  try {
    const { getRequestContext } = await import('@cloudflare/next-on-pages');
    const ctx = getRequestContext();
    const kv = (ctx.env as Record<string, unknown>).GLIMMER_KV as KVNamespaceLike | undefined;
    return kv || null;
  } catch {
    return null;
  }
}

// --- In-memory fallback (local dev) ---

const globalStore = globalThis as unknown as { __glimmer_kv_map?: Map<string, string> };
if (!globalStore.__glimmer_kv_map) globalStore.__glimmer_kv_map = new Map();
const memMap = globalStore.__glimmer_kv_map;

// --- Unified KV helpers ---

export async function kvGet(key: string): Promise<string | null> {
  const kv = await getKV();
  if (kv) return kv.get(key);
  return memMap.get(key) ?? null;
}

export async function kvPut(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
  const kv = await getKV();
  if (kv) {
    await kv.put(key, value, opts?.expirationTtl ? { expirationTtl: opts.expirationTtl } : undefined);
    return;
  }
  memMap.set(key, value);
}

export async function kvDelete(key: string): Promise<void> {
  const kv = await getKV();
  if (kv) { await kv.delete(key); return; }
  memMap.delete(key);
}

export async function kvListKeys(prefix: string): Promise<string[]> {
  const kv = await getKV();
  if (kv) {
    const list = await kv.list({ prefix });
    return list.keys.map(k => k.name);
  }
  return Array.from(memMap.keys()).filter(k => k.startsWith(prefix));
}
