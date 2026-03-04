export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getBatch, getJob, updateJob, setJobComplete, setJobError, updateBatchStatus } from '@/lib/storage';
import { checkVideoTaskStatus } from '@/lib/veo';
import { archiveVideos } from '@/lib/r2';
import { checkCredits } from '@/lib/credits';
import { sendCompletionEmail } from '@/lib/email';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getVideoUrl } from '@/lib/video-url';

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
    let hasProcessing = false;

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

      // If job is still processing, poll external API
      if (job.status === 'processing' && job.provider) {
        hasProcessing = true;

        try {
          const result = await checkVideoTaskStatus(job);

          if (result.done) {
            if (result.error) {
              await setJobError(jobId, result.error);
              segments.push({
                jobId,
                segmentIndex: job.segmentIndex ?? segments.length,
                status: 'error',
                error: result.error,
              });
            } else if (result.videoUrls && result.videoUrls.length > 0) {
              // Archive videos to R2
              const archive = await archiveVideos(jobId, result.videoUrls);
              const finalUrls = archive.urls;

              // Check if paid user for TTL
              let paidUser = false;
              if (job.email) {
                try {
                  const balance = await checkCredits(job.email);
                  paidUser = balance.paidTotal > 0;
                } catch {
                  // Non-critical
                }
              }

              await setJobComplete(jobId, finalUrls[0], finalUrls, {
                paidUser,
                archived: archive.archived,
              });

              segments.push({
                jobId,
                segmentIndex: job.segmentIndex ?? segments.length,
                status: 'complete',
                progress: 100,
                videoUrl: getVideoUrl(jobId, finalUrls[0]),
              });

              // Send completion email for first segment only (as notification)
              if (job.segmentIndex === 0 && job.email) {
                sendCompletionEmail(job.email, batchId, batch.name || '').catch(err =>
                  logger.error(`[Email] Batch completion notification failed:`, err)
                );
              }
            }
          } else {
            // Still processing
            if (result.progress) {
              await updateJob(jobId, { progress: result.progress });
            }
            segments.push({
              jobId,
              segmentIndex: job.segmentIndex ?? segments.length,
              status: 'processing',
              progress: result.progress || job.progress || 10,
            });
          }
        } catch (err) {
          logger.error(`[Batch] Error checking segment ${jobId}:`, err);
          segments.push({
            jobId,
            segmentIndex: job.segmentIndex ?? segments.length,
            status: 'processing',
            progress: job.progress || 10,
          });
        }
      } else {
        // Job already complete or errored
        segments.push({
          jobId,
          segmentIndex: job.segmentIndex ?? segments.length,
          status: job.status,
          progress: job.status === 'complete' ? 100 : job.progress,
          videoUrl: getVideoUrl(jobId, job.videoUrl),
          error: job.error,
        });
      }
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
      name: batch.name,
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
