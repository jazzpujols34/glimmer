export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/storage';

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

    // Fetch video from CDN server-side (no CORS restriction)
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
      // public: Cloudflare CDN can cache at edge; s-maxage: edge caches for 24h; max-age: browser caches for 4h
      'Cache-Control': 'public, s-maxage=86400, max-age=14400',
    });
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    // Stream the response body through
    return new NextResponse(cdnResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Proxy video error:', error);
    return NextResponse.json({ error: '影片代理載入失敗' }, { status: 500 });
  }
}
