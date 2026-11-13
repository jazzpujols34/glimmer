export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/storage';
import { settleJob, archiveIfNeeded } from '@/lib/job-settle';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError, normalizeError } from '@/lib/errors';
import { errors } from '@/lib/api-response';
import { getVideoUrl, getVideoUrls } from '@/lib/video-url';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limit: 60 status polls per minute per IP
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`status:${ip}`, 60, 60);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return errors.rateLimited(retryAfter);
    }

    const { id } = await params;
    const job = await getJob(id);

    if (!job) {
      return NextResponse.json(
        { error: '找不到此任務' },
        { status: 404 }
      );
    }

    // Ask the provider once if still processing; retry archival if a finished
    // job still points at expiring provider links.
    const current = job.status === 'complete' ? await archiveIfNeeded(job) : await settleJob(job);

    // Return current state (complete, error, or queued)
    return NextResponse.json({
      id: current.id,
      status: current.status,
      progress: current.status === 'processing' ? current.progress || 10 : current.progress,
      videoUrl: getVideoUrl(current.id, current.videoUrl, 0),
      videoUrls: getVideoUrls(current.id, current.videoUrls),
      error: current.error ? normalizeError(current.error) : undefined,
    });
  } catch (error) {
    captureError(error, { route: '/api/status' });
    return NextResponse.json(
      { error: '發生錯誤' },
      { status: 500 }
    );
  }
}
