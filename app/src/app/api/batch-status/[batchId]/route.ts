export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getBatch, getJob, updateBatchStatus } from '@/lib/storage';
import { settleJob } from '@/lib/job-settle';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { getVideoUrl } from '@/lib/video-url';
import { getRequesterEmail, ownsOrAdmin } from '@/lib/owner';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    // Rate limit: 30 batch status polls per minute per IP
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`batch-status:${ip}`, 30, 60);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const { batchId } = await params;
    const batch = await getBatch(batchId);

    if (!batch) {
      return NextResponse.json(
        { error: '找不到此批次' },
        { status: 404 }
      );
    }

    // Progress/segments/video URLs stay bearer-id-visible (matches status/[id]'s
    // documented-open posture — polling clients here send no email today), but
    // `name` can carry the deceased's name and must not leak to non-owners.
    const requesterEmail = getRequesterEmail(request);
    const isOwner = !!requesterEmail && ownsOrAdmin(batch.email, requesterEmail);

    // Build segment status array
    interface SegmentStatus {
      jobId: string;
      segmentIndex: number;
      status: string;
      progress?: number;
      videoUrl?: string;
      error?: string;
    }

    const segments: SegmentStatus[] = [];

    // Check each segment job
    for (const jobId of batch.segmentJobIds) {
      const job = await getJob(jobId);
      if (!job) {
        segments.push({
          jobId,
          segmentIndex: segments.length,
          status: 'error',
          error: 'Job not found',
        });
        continue;
      }

      const current = await settleJob(job, { batchName: batch.name });
      segments.push({
        jobId,
        segmentIndex: current.segmentIndex ?? segments.length,
        status: current.status,
        progress: current.status === 'complete' ? 100 : current.status === 'processing' ? current.progress || 10 : current.progress,
        videoUrl: getVideoUrl(jobId, current.videoUrl),
        error: current.error,
      });
    }

    // Sort by segment index
    segments.sort((a, b) => a.segmentIndex - b.segmentIndex);

    // Update batch status
    const updatedBatch = await updateBatchStatus(batchId);

    // Calculate overall progress
    const completedCount = segments.filter(s => s.status === 'complete').length;
    const failedCount = segments.filter(s => s.status === 'error').length;
    const totalProgress = segments.reduce((sum, s) => sum + (s.progress || 0), 0);
    const overallProgress = Math.floor(totalProgress / segments.length);

    return NextResponse.json({
      batchId: batch.id,
      status: updatedBatch?.status || batch.status,
      projectId: batch.projectId,
      ...(isOwner ? { name: batch.name } : {}),
      totalSegments: batch.totalSegments,
      completedSegments: completedCount,
      failedSegments: failedCount,
      progress: overallProgress,
      segments,
      createdAt: batch.createdAt,
    });
  } catch (error) {
    captureError(error, { route: '/api/batch-status' });
    return NextResponse.json(
      { error: '發生錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}
