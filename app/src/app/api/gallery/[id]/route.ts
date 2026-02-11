export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { deleteJob, getJob, updateJob } from '@/lib/storage';
import { captureError } from '@/lib/errors';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await getJob(id);
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
      favorite: job.favorite,
      projectId: job.projectId,
    });
  } catch (error) {
    captureError(error, { route: '/api/gallery/[id]' });
    return NextResponse.json({ error: '載入失敗' }, { status: 500 });
  }
}

// PATCH /api/gallery/[id] - Toggle favorite status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: '找不到該影片' }, { status: 404 });
    }

    // Toggle favorite if not explicitly set
    const newFavorite = body.favorite !== undefined ? body.favorite : !job.favorite;

    const updated = await updateJob(id, { favorite: newFavorite });
    if (!updated) {
      return NextResponse.json({ error: '更新失敗' }, { status: 500 });
    }

    return NextResponse.json({
      id: updated.id,
      favorite: updated.favorite,
    });
  } catch (error) {
    captureError(error, { route: '/api/gallery/[id]' });
    return NextResponse.json({ error: '更新失敗' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: '找不到該影片' }, { status: 404 });
    }

    const deleted = await deleteJob(id);
    if (!deleted) {
      return NextResponse.json({ error: '刪除失敗' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, { route: '/api/gallery/[id]' });
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 });
  }
}
