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

    console.log(`[proxy-video] Request: jobId=${jobId}, index=${index}`);

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const job = await getJob(jobId);
    if (!job) {
      console.error(`[proxy-video] Job not found: ${jobId}`);
      return NextResponse.json({ error: '找不到該影片 (job not found in KV)' }, { status: 404 });
    }
    if (job.status !== 'complete') {
      console.error(`[proxy-video] Job not complete: ${jobId}, status=${job.status}`);
      return NextResponse.json({ error: `影片尚未完成 (status: ${job.status})` }, { status: 404 });
    }

    const urls = job.videoUrls?.length ? job.videoUrls : job.videoUrl ? [job.videoUrl] : [];
    console.log(`[proxy-video] Job ${jobId} has ${urls.length} videos, requesting index ${index}`);

    if (index < 0 || index >= urls.length) {
      return NextResponse.json({ error: `Invalid video index: ${index} (available: 0-${urls.length - 1})` }, { status: 400 });
    }

    const videoUrl = urls[index];
    const isR2Key = !videoUrl.startsWith('http');
    console.log(`[proxy-video] Video URL: ${videoUrl.substring(0, 100)}, isR2Key=${isR2Key}`);

    if (isR2Key) {
      // Read from R2 storage
      const r2Object = await r2Get(videoUrl);
      if (!r2Object) {
        console.error(`[proxy-video] R2 object not found: ${videoUrl}`);
        return NextResponse.json(
          { error: `影片檔案不存在 (R2 key: ${videoUrl})，可能已過期或 R2 未設定。` },
          { status: 404 }
        );
      }
      console.log(`[proxy-video] R2 object found: ${videoUrl}, size=${r2Object.size}`);

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
