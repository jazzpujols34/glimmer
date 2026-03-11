export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/storage';
import { r2Get } from '@/lib/r2';
import { captureError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Proxy video fetches server-side to bypass CORS restrictions on CDN URLs.
 * Query params: jobId, index (original R2 index, NOT array position)
 *
 * After clip deletion, KV videoUrls array shrinks but R2 files keep their
 * original indices. So ?index=2 may be out of bounds in KV but still valid
 * in R2 at videos/{jobId}/2.mp4.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const jobId = searchParams.get('jobId');
    const index = parseInt(searchParams.get('index') ?? '0', 10);

    logger.debug('proxy-video', `Request: jobId=${jobId}, index=${index}`);

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const job = await getJob(jobId);

    // If job exists in KV, try to serve from its video URLs
    if (job && job.status === 'complete') {
      const urls = job.videoUrls?.length ? job.videoUrls : job.videoUrl ? [job.videoUrl] : [];
      logger.debug('proxy-video', `Job ${jobId} found in KV, ${urls.length} videos`);

      if (index >= 0 && index < urls.length) {
        const videoUrl = urls[index];
        const isR2Key = !videoUrl.startsWith('http');

        if (isR2Key) {
          const r2Object = await r2Get(videoUrl);
          if (r2Object) {
            logger.debug('proxy-video', `R2 object found: ${videoUrl}, size=${r2Object.size}`);
            const headers = new Headers({
              'Content-Type': r2Object.contentType,
              'Content-Length': String(r2Object.size),
              'Cache-Control': 'public, s-maxage=86400, max-age=14400',
            });
            return new NextResponse(r2Object.body, { status: 200, headers });
          }
        } else {
          // CDN URL
          const cdnResponse = await fetch(videoUrl);
          if (cdnResponse.ok) {
            const contentType = cdnResponse.headers.get('content-type') || 'video/mp4';
            const contentLength = cdnResponse.headers.get('content-length');
            const headers = new Headers({
              'Content-Type': contentType,
              'Cache-Control': 'public, s-maxage=86400, max-age=14400',
            });
            if (contentLength) headers.set('Content-Length', contentLength);
            return new NextResponse(cdnResponse.body, { status: 200, headers });
          }
        }
      } else {
        // Index out of bounds — fall through to R2 direct lookup
        // This happens after clip deletion when R2 keys retain original indices
        logger.debug('proxy-video', `Index ${index} out of bounds (${urls.length} urls), falling through to R2`);
      }
    }

    // KV record expired, index out of bounds, or video URL failed
    // Try R2 directly with standard key pattern: videos/{jobId}/{index}.mp4
    const r2Key = `videos/${jobId}/${index}.mp4`;
    logger.debug('proxy-video', `Trying R2 directly: ${r2Key}`);

    const r2Object = await r2Get(r2Key);
    if (r2Object) {
      logger.debug('proxy-video', `R2 fallback success: ${r2Key}, size=${r2Object.size}`);
      const headers = new Headers({
        'Content-Type': r2Object.contentType,
        'Content-Length': String(r2Object.size),
        'Cache-Control': 'public, s-maxage=86400, max-age=14400',
      });
      return new NextResponse(r2Object.body, { status: 200, headers });
    }

    // Video not found anywhere
    logger.error(`[proxy-video] Video not found: jobId=${jobId}, index=${index}`);
    return NextResponse.json(
      { error: '找不到該影片。KV 記錄已過期且 R2 中無存檔。' },
      { status: 404 }
    );
  } catch (error) {
    captureError(error, { route: '/api/proxy-video' });
    return NextResponse.json({ error: '影片代理載入失敗' }, { status: 500 });
  }
}
