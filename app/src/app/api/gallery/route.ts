export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCompletedJobs } from '@/lib/storage';

/**
 * Transform video URL to proxy URL if it's an R2 key (not starting with http)
 */
function getVideoUrl(jobId: string, url: string | undefined, index: number = 0): string {
  if (!url) return '';
  // R2 keys don't start with http - need proxy
  if (!url.startsWith('http')) {
    return `/api/proxy-video?jobId=${jobId}&index=${index}`;
  }
  // CDN URLs work directly
  return url;
}

function getVideoUrls(jobId: string, urls: string[] | undefined): string[] {
  if (!urls || urls.length === 0) return [];
  return urls.map((url, index) => getVideoUrl(jobId, url, index));
}

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
    console.error('Gallery API error:', error);
    return NextResponse.json(
      { error: '無法載入影片庫' },
      { status: 500 }
    );
  }
}
