export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCompletedJobs } from '@/lib/storage';
import { captureError } from '@/lib/errors';
import { getVideoUrl, getVideoUrls } from '@/lib/video-url';

export async function GET() {
  try {
    const jobs = await getCompletedJobs();

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
