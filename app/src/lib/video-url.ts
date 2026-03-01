/**
 * Resolves any video URL format into a form usable by the target context.
 *
 * Video URLs exist in 4+ formats throughout the app:
 *   1. CDN URL: https://vod.bytepluscdn.com/.../video.mp4 (expires ~24h)
 *   2. R2 key: videos/job_xxx/0.mp4
 *   3. Relative proxy: /api/proxy-video?jobId=xxx&index=0
 *   4. Absolute proxy: https://glimmer.video/api/proxy-video?...
 *   5. Local: local://blob-url
 *
 * This is the SINGLE SOURCE OF TRUTH for URL resolution.
 * Every component that needs a video URL MUST use this.
 */

export type VideoUrlContext = 'playback' | 'export';

export function resolveVideoUrl(
  url: string,
  context: VideoUrlContext,
  baseUrl?: string
): string {
  if (!url) return '';

  const origin =
    baseUrl ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_BASE_URL || '');

  // 1. Already absolute HTTP(S) URL — CDN or absolute proxy
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // For export: if it's an absolute proxy URL pointing to our domain, keep as-is
    // Cloud Run needs absolute URLs it can fetch
    return url;
  }

  // 2. Local blob reference (only works for playback in browser)
  if (url.startsWith('local://')) {
    if (context === 'export') {
      console.warn('[resolveVideoUrl] local:// URL cannot be used for export');
      return '';
    }
    return url.replace('local://', '');
  }

  // 3. Relative proxy path — starts with /api/
  if (url.startsWith('/api/')) {
    if (context === 'export') {
      // Cloud Run needs absolute URL
      return `${origin}${url}`;
    }
    return url; // Browser can use relative path
  }

  // 4. R2 key pattern — videos/job_xxx/0.mp4 or similar
  //    Also catches: uploads/userId/file.mp4, exports/jobId/exportId.mp4
  if (url.match(/^(videos|uploads|exports)\//) || url.endsWith('.mp4')) {
    // Try to extract jobId and index for proxy-video (more reliable)
    const proxyMatch = url.match(/^videos\/([^/]+)\/(\d+)\.mp4$/);
    if (proxyMatch) {
      const proxyPath = `/api/proxy-video?jobId=${encodeURIComponent(proxyMatch[1])}&index=${proxyMatch[2]}`;
      return context === 'export' ? `${origin}${proxyPath}` : proxyPath;
    }
    // Fallback: use proxy-r2 for any R2 key
    const r2Path = `/api/proxy-r2?key=${encodeURIComponent(url)}`;
    return context === 'export' ? `${origin}${r2Path}` : r2Path;
  }

  // 5. Unknown format — try proxy-r2 as last resort
  console.warn(`[resolveVideoUrl] Unknown URL format: ${url}`);
  const fallbackPath = `/api/proxy-r2?key=${encodeURIComponent(url)}`;
  return context === 'export' ? `${origin}${fallbackPath}` : fallbackPath;
}

/**
 * Validate that a video URL is accessible.
 * Use before export to fail fast instead of waiting for Cloud Run.
 */
export async function validateVideoUrl(
  url: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Network error: ${(err as Error).message}` };
  }
}
