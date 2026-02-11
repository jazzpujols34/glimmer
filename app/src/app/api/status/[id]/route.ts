export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJob, setJobComplete, setJobError } from '@/lib/storage';
import { checkVideoTaskStatus } from '@/lib/veo';
import { archiveVideos } from '@/lib/r2';
import { checkCredits } from '@/lib/credits';
import { sendCompletionEmail } from '@/lib/email';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';

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
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const { id } = await params;
    const job = await getJob(id);

    if (!job) {
      return NextResponse.json(
        { error: '找不到此任務' },
        { status: 404 }
      );
    }

    // If job is still processing, poll the external API once
    if (job.status === 'processing' && job.provider) {
      const result = await checkVideoTaskStatus(job);

      if (result.done) {
        if (result.error) {
          await setJobError(id, result.error);
          return NextResponse.json({
            id: job.id,
            status: 'error',
            error: result.error,
          });
        }
        if (result.videoUrls && result.videoUrls.length > 0) {
          // Archive videos to R2 for permanent storage
          const archive = await archiveVideos(id, result.videoUrls);
          const finalUrls = archive.urls;

          // Paid users get 30-day TTL; free users get 24h
          let paidUser = false;
          if (job.email) {
            try {
              const balance = await checkCredits(job.email);
              paidUser = balance.paidTotal > 0;
            } catch {
              // Non-critical — default to free TTL
            }
          }

          await setJobComplete(id, finalUrls[0], finalUrls, {
            paidUser,
            archived: archive.archived,
          });

          // Send completion notification email (fire-and-forget)
          if (job.email) {
            sendCompletionEmail(job.email, id, job.name || '').catch(err =>
              console.error(`[Email] Completion notification failed for job ${id}:`, err)
            );
          }

          return NextResponse.json({
            id: job.id,
            status: 'complete',
            progress: 100,
            videoUrl: finalUrls[0],
            videoUrls: finalUrls,
          });
        }
      }

      // Still processing — update progress
      if (result.progress) {
        await updateJob(id, { progress: result.progress });
      }

      return NextResponse.json({
        id: job.id,
        status: 'processing',
        progress: result.progress || job.progress || 10,
      });
    }

    // Return current state (complete, error, or queued)
    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      videoUrl: job.videoUrl,
      videoUrls: job.videoUrls,
      error: job.error,
    });
  } catch (error) {
    captureError(error, { route: '/api/status' });
    return NextResponse.json(
      { error: '發生錯誤' },
      { status: 500 }
    );
  }
}
