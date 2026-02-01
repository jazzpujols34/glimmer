/**
 * Shared R2 abstraction: Cloudflare R2 when deployed, no-op fallback for local dev.
 * Follows the same getRequestContext() pattern as kv.ts.
 */

// --- R2 access (Cloudflare Pages) ---

interface R2ObjectLike {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
  size: number;
}

interface R2BucketLike {
  put(key: string, value: ArrayBuffer | ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
}

async function getR2(): Promise<R2BucketLike | null> {
  try {
    const { getRequestContext } = await import('@cloudflare/next-on-pages');
    const ctx = getRequestContext();
    const r2 = (ctx.env as Record<string, unknown>).GLIMMER_R2 as R2BucketLike | undefined;
    return r2 || null;
  } catch {
    return null;
  }
}

// --- Unified R2 helpers ---

export async function r2Put(
  key: string,
  body: ArrayBuffer | ReadableStream,
  contentType?: string,
): Promise<boolean> {
  const r2 = await getR2();
  if (!r2) return false;
  await r2.put(key, body, contentType ? { httpMetadata: { contentType } } : undefined);
  return true;
}

export async function r2Get(
  key: string,
): Promise<{ body: ReadableStream; contentType: string; size: number } | null> {
  const r2 = await getR2();
  if (!r2) return null;
  const obj = await r2.get(key);
  if (!obj) return null;
  return {
    body: obj.body,
    contentType: obj.httpMetadata?.contentType || 'video/mp4',
    size: obj.size,
  };
}

export async function r2Delete(key: string): Promise<boolean> {
  const r2 = await getR2();
  if (!r2) return false;
  await r2.delete(key);
  return true;
}

// --- Video archival ---

/**
 * Download videos from provider CDN and upload to R2 for permanent storage.
 * Returns R2 object keys if successful, or original CDN URLs as fallback.
 */
export async function archiveVideos(
  jobId: string,
  cdnUrls: string[],
): Promise<{ urls: string[]; archived: boolean }> {
  const r2 = await getR2();
  if (!r2) {
    // R2 not available (local dev) — pass through CDN URLs
    return { urls: cdnUrls, archived: false };
  }

  const archivedUrls: string[] = [];

  for (let i = 0; i < cdnUrls.length; i++) {
    const cdnUrl = cdnUrls[i];
    const r2Key = `videos/${jobId}/${i}.mp4`;

    try {
      const res = await fetch(cdnUrl);
      if (!res.ok || !res.body) {
        console.error(`[R2] Failed to fetch CDN video ${i} for job ${jobId}: ${res.status}`);
        // Fall back to CDN URL for this video
        archivedUrls.push(cdnUrl);
        continue;
      }

      await r2.put(r2Key, res.body, { httpMetadata: { contentType: 'video/mp4' } });
      archivedUrls.push(r2Key);
      console.log(`[R2] Archived video ${i} for job ${jobId} → ${r2Key}`);
    } catch (err) {
      console.error(`[R2] Archive error for video ${i} of job ${jobId}:`, err);
      // Fall back to CDN URL for this video
      archivedUrls.push(cdnUrl);
    }
  }

  const allArchived = archivedUrls.every(u => !u.startsWith('http'));
  return { urls: archivedUrls, archived: allArchived };
}
