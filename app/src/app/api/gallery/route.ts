export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCompletedJobs } from '@/lib/storage';

export async function GET() {
  try {
    const jobs = await getCompletedJobs();

    return NextResponse.json({
      jobs: jobs.map(job => ({
        id: job.id,
        name: job.name || '未命名',
        occasion: job.occasion || 'other',
        videoUrl: job.videoUrl,
        videoUrls: job.videoUrls,
        createdAt: job.createdAt,
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
