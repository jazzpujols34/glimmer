export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/storage';
import { r2Get } from '@/lib/r2';
import { captureError } from '@/lib/errors';

/**
 * Proxy video fetches server-side to bypass CORS restrictions on CDN URLs.
 * Query params: jobId, index (0-based video index)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const jobId = searchParams.get('jobId');
    const index = parseInt(searchParams.get('index') ?? '0', 10);

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const job = await getJob(jobId);
    if (!job || job.status !== 'complete') {
      return NextResponse.json({ error: '找不到該影片' }, { status: 404 });
    }

    const urls = job.videoUrls?.length ? job.videoUrls : job.videoUrl ? [job.videoUrl] : [];
    if (index < 0 || index >= urls.length) {
      return NextResponse.json({ error: 'Invalid video index' }, { status: 400 });
    }

    const videoUrl = urls[index];
    const isR2Key = !videoUrl.startsWith('http');

    if (isR2Key) {
      // Read from R2 storage
      const r2Object = await r2Get(videoUrl);
      if (!r2Object) {
        return NextResponse.json(
          { error: '影片檔案不存在，可能已過期。' },
          { status: 404 }
        );
      }

      const headers = new Headers({
        'Content-Type': r2Object.contentType,
        'Content-Length': String(r2Object.size),
        'Cache-Control': 'public, s-maxage=86400, max-age=14400',
      });

      return new NextResponse(r2Object.body, { status: 200, headers });
    }

    // Legacy: fetch video from CDN server-side (no CORS restriction)
    const cdnResponse = await fetch(videoUrl);
    if (!cdnResponse.ok) {
      return NextResponse.json(
        { error: `CDN fetch failed: ${cdnResponse.status}. 影片連結可能已過期，請重新生成。` },
        { status: 502 }
      );
    }

    const contentType = cdnResponse.headers.get('content-type') || 'video/mp4';
    const contentLength = cdnResponse.headers.get('content-length');

    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'public, s-maxage=86400, max-age=14400',
    });
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    return new NextResponse(cdnResponse.body, { status: 200, headers });
  } catch (error) {
    captureError(error, { route: '/api/proxy-video' });
    return NextResponse.json({ error: '影片代理載入失敗' }, { status: 500 });
  }
}
