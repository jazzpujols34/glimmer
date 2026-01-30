export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getJob, getAllJobIds } from '@/lib/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    console.log(`[Status API] Looking for job: ${id}`);
    console.log(`[Status API] Available jobs: ${getAllJobIds().join(', ') || 'none'}`);

    const job = getJob(id);

    if (!job) {
      console.log(`[Status API] Job not found: ${id}`);
      return NextResponse.json(
        { error: '找不到此任務' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      videoUrl: job.videoUrl,
      videoUrls: job.videoUrls,
      error: job.error,
      // @ts-expect-error - analysis is added by fallback
      analysis: job.analysis,
    });
  } catch (error) {
    console.error('Status API error:', error);
    return NextResponse.json(
      { error: '發生錯誤' },
      { status: 500 }
    );
  }
}
