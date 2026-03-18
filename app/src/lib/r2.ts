/**
 * Shared R2 abstraction: Cloudflare R2 when deployed, no-op fallback for local dev.
 * Follows the same getRequestContext() pattern as kv.ts.
 */

import { logger } from '@/lib/logger';

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

// --- Photo storage (for provider fallback on content rejection) ---

/**
 * Store uploaded photos in R2 so they can be re-used if the primary
 * provider rejects the output (e.g. BytePlus "sensitive content" false positive).
 * Returns R2 keys on success, empty array on failure.
 */
export async function storePhotos(
  jobId: string,
  photos: Buffer[],
): Promise<string[]> {
  const r2 = await getR2();
  if (!r2) return [];

  const keys: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const key = `photos/${jobId}/${i}`;
    try {
      await r2.put(key, photos[i].buffer as ArrayBuffer, { httpMetadata: { contentType: 'image/jpeg' } });
      keys.push(key);
    } catch (err) {
      logger.error(`[R2] Failed to store photo ${i} for job ${jobId}:`, err);
      // Clean up already-stored photos
      for (const k of keys) { try { await r2.delete(k); } catch {} }
      return [];
    }
  }
  return keys;
}

/**
 * Retrieve stored photos from R2 as Buffers.
 */
export async function retrievePhotos(photoKeys: string[]): Promise<Buffer[]> {
  const photos: Buffer[] = [];
  for (const key of photoKeys) {
    const obj = await r2Get(key);
    if (!obj) return []; // Missing photo = can't retry
    const arrayBuf = await new Response(obj.body).arrayBuffer();
    photos.push(Buffer.from(arrayBuf));
  }
  return photos;
}

/**
 * Delete stored photos (cleanup after generation completes or expires).
 */
export async function deletePhotos(photoKeys: string[]): Promise<void> {
  for (const key of photoKeys) {
    try { await r2Delete(key); } catch {}
  }
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
        logger.error(`[R2] Failed to fetch CDN video ${i} for job ${jobId}: ${res.status}`);
        // Fall back to CDN URL for this video
        archivedUrls.push(cdnUrl);
        continue;
      }

      await r2.put(r2Key, res.body, { httpMetadata: { contentType: 'video/mp4' } });
      archivedUrls.push(r2Key);
      logger.debug('R2', `Archived video ${i} for job ${jobId} → ${r2Key}`);
    } catch (err) {
      logger.error(`[R2] Archive error for video ${i} of job ${jobId}:`, err);
      // Fall back to CDN URL for this video
      archivedUrls.push(cdnUrl);
    }
  }

  const allArchived = archivedUrls.every(u => !u.startsWith('http'));
  return { urls: archivedUrls, archived: allArchived };
}
