export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJob, setJobComplete, setJobError } from '@/lib/storage';
import { checkVideoTaskStatus, createVideoTask } from '@/lib/veo';
import { archiveVideos, retrievePhotos, deletePhotos } from '@/lib/r2';
import { checkCredits } from '@/lib/credits';
import { sendCompletionEmail } from '@/lib/email';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getVideoUrl, getVideoUrls } from '@/lib/video-url';
import type { ModelType } from '@/types';

// Errors that indicate provider content filtering (not actual NSFW content)
const CONTENT_FILTER_ERRORS = [
  'OutputVideoSensitiveContentDetected',
  'SensitiveContentDetected',
  'content_policy_violation',
];

// Provider fallback order (tried in sequence, skipping those without credentials)
const FALLBACK_ORDER: ModelType[] = ['byteplus', 'kling-ai', 'veo-3.1'];

function getNextProvider(current: ModelType): ModelType | undefined {
  const idx = FALLBACK_ORDER.indexOf(current);
  if (idx === -1) return undefined;
  // Return the next provider in the list that isn't the current one
  for (let i = idx + 1; i < FALLBACK_ORDER.length; i++) {
    return FALLBACK_ORDER[i];
  }
  return undefined;
}

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
          const errorStr = typeof result.error === 'object'
            ? ((result.error as Record<string, string>).message || JSON.stringify(result.error))
            : String(result.error);

          // Check if this is a content filter rejection that we can retry with a different provider
          const isContentFilter = CONTENT_FILTER_ERRORS.some(code => errorStr.includes(code));
          const fallbackProvider = job.provider ? getNextProvider(job.provider) : undefined;

          if (isContentFilter && fallbackProvider && !job.fallbackAttempted && job.photoKeys?.length) {
            logger.debug('Fallback', `Provider ${job.provider} content-filtered job ${id}, trying fallback`);
            try {
              const photos = await retrievePhotos(job.photoKeys);
              if (photos.length > 0) {
                // Try providers in fallback order until one succeeds
                const providersToTry = [fallbackProvider, getNextProvider(fallbackProvider)].filter(Boolean) as ModelType[];
                for (const provider of providersToTry) {
                  try {
                    const taskData = await createVideoTask({
                      photos,
                      name: job.name || '',
                      occasion: job.occasion || 'other',
                      settings: { ...job.settings!, model: provider },
                    });
                    await updateJob(id, {
                      status: 'processing',
                      progress: 10,
                      provider: taskData.provider,
                      externalTaskIds: taskData.externalTaskIds,
                      veoOperationName: taskData.veoOperationName,
                      fallbackAttempted: true,
                      error: undefined,
                    });
                    logger.debug('Fallback', `Job ${id} re-submitted to ${provider}`);
                    return NextResponse.json({
                      id: job.id,
                      status: 'processing',
                      progress: 10,
                    });
                  } catch (providerErr) {
                    logger.error(`[Fallback] ${provider} failed for job ${id}:`, providerErr);
                    // Continue to next provider
                  }
                }
              }
            } catch (fallbackErr) {
              logger.error(`[Fallback] Photo retrieval failed for job ${id}:`, fallbackErr);
            }
          }

          await setJobError(id, errorStr);
          return NextResponse.json({
            id: job.id,
            status: 'error',
            error: errorStr,
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

          // Clean up stored photos (no longer needed after successful generation)
          if (job.photoKeys?.length) {
            deletePhotos(job.photoKeys).catch(() => {});
          }

          // Send completion notification email (fire-and-forget)
          if (job.email) {
            sendCompletionEmail(job.email, id, job.name || '').catch(err =>
              logger.error(`[Email] Completion notification failed for job ${id}:`, err)
            );
          }

          return NextResponse.json({
            id: job.id,
            status: 'complete',
            progress: 100,
            videoUrl: getVideoUrl(job.id, finalUrls[0], 0),
            videoUrls: getVideoUrls(job.id, finalUrls),
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

    // If complete but not archived, retry archival (CDN URLs expire in 24h)
    if (job.status === 'complete' && !job.archived && job.videoUrls?.length) {
      const hasCdnUrls = job.videoUrls.some(u => u.startsWith('http'));
      if (hasCdnUrls) {
        logger.debug('R2', `Retrying archival for job ${id} (${job.videoUrls.length} videos)`);
        try {
          const archive = await archiveVideos(id, job.videoUrls);
          if (archive.archived) {
            await updateJob(id, {
              videoUrls: archive.urls,
              videoUrl: archive.urls[0],
              archived: true,
            });
            return NextResponse.json({
              id: job.id,
              status: 'complete',
              progress: 100,
              videoUrl: getVideoUrl(job.id, archive.urls[0], 0),
              videoUrls: getVideoUrls(job.id, archive.urls),
            });
          }
        } catch (err) {
          logger.error(`[R2] Archival retry failed for job ${id}:`, err);
        }
      }
    }

    // Normalize error to string (providers may return objects like {code, message})
    const normalizedError = job.error
      ? (typeof job.error === 'object' ? ((job.error as Record<string, string>).message || JSON.stringify(job.error)) : String(job.error))
      : undefined;

    // Return current state (complete, error, or queued)
    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      videoUrl: getVideoUrl(job.id, job.videoUrl, 0),
      videoUrls: getVideoUrls(job.id, job.videoUrls),
      error: normalizedError,
    });
  } catch (error) {
    captureError(error, { route: '/api/status' });
    return NextResponse.json(
      { error: '發生錯誤' },
      { status: 500 }
    );
  }
}
