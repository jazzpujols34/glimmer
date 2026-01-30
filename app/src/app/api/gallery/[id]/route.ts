export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { deleteJob, getJob } from '@/lib/storage';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = getJob(id);
    if (!job) {
      return NextResponse.json({ error: '找不到該影片' }, { status: 404 });
    }
    if (job.status !== 'complete') {
      return NextResponse.json({ error: '影片尚未完成' }, { status: 400 });
    }
    return NextResponse.json({
      id: job.id,
      name: job.name,
      occasion: job.occasion,
      videoUrl: job.videoUrl,
      videoUrls: job.videoUrls,
      createdAt: job.createdAt,
      settings: job.settings,
    });
  } catch (error) {
    console.error('Gallery GET error:', error);
    return NextResponse.json({ error: '載入失敗' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = getJob(id);
    if (!job) {
      return NextResponse.json({ error: '找不到該影片' }, { status: 404 });
    }

    const deleted = deleteJob(id);
    if (!deleted) {
      return NextResponse.json({ error: '刪除失敗' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete API error:', error);
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 });
  }
}
