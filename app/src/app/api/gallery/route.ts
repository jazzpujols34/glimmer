export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getCompletedJobs, updateJob } from '@/lib/storage';
import { archiveVideos } from '@/lib/r2';
import { captureError } from '@/lib/errors';
import { getVideoUrl, getVideoUrls } from '@/lib/video-url';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { errors } from '@/lib/api-response';
import { resolveReaderEmail } from '@/lib/owner';
import { isAdmin } from '@/lib/credits';

export async function GET(request: NextRequest) {
  try {
    // Rate limit: this route does a full KV scan + R2 archival retries on every call
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`gallery:${ip}`, 30, 60);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return errors.rateLimited(retryAfter);
    }

    const resolved = await resolveReaderEmail(request);
    if ('error' in resolved) {
      if (resolved.error === 'SESSION_REQUIRED') return errors.sessionRequired();
      return resolved.error === 'INVALID' ? errors.invalidEmail() : errors.missingField('email');
    }
    const requesterEmail = resolved.email;

    // Admins see every job; everyone else only sees their own
    const jobs = await getCompletedJobs(isAdmin(requesterEmail) ? undefined : requesterEmail);

    // Retry archival for any unarchived jobs (CDN URLs expire in 24h)
    for (const job of jobs) {
      if (!job.archived && job.videoUrls?.some(u => u.startsWith('http'))) {
        try {
          const archive = await archiveVideos(job.id, job.videoUrls);
          if (archive.archived) {
            await updateJob(job.id, {
              videoUrls: archive.urls,
              videoUrl: archive.urls[0],
              archived: true,
            });
            job.videoUrls = archive.urls;
            job.videoUrl = archive.urls[0];
            job.archived = true;
            logger.debug('R2', `Gallery: archived job ${job.id} on retry`);
          }
        } catch {
          // Non-blocking — still return the CDN URLs
        }
      }
    }

    return NextResponse.json({
      jobs: jobs.map(job => ({
        id: job.id,
        name: job.name || '未命名',
        occasion: job.occasion || 'other',
        videoUrl: getVideoUrl(job.id, job.videoUrl, 0),
        videoUrls: getVideoUrls(job.id, job.videoUrls),
        createdAt: job.createdAt,
        favorite: job.favorite,
        projectId: job.projectId,
        settings: job.settings ? {
          model: job.settings.model,
          aspectRatio: job.settings.aspectRatio,
          videoLength: job.settings.videoLength,
          resolution: job.settings.resolution,
        } : undefined,
      })),
    });
  } catch (error) {
    captureError(error, { route: '/api/gallery' });
    return NextResponse.json(
      { error: '無法載入影片庫' },
      { status: 500 }
    );
  }
}
