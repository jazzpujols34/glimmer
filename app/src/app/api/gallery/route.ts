export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCompletedJobs, updateJob } from '@/lib/storage';
import { archiveVideos } from '@/lib/r2';
import { captureError } from '@/lib/errors';
import { getVideoUrl, getVideoUrls } from '@/lib/video-url';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const jobs = await getCompletedJobs();

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
