export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { deleteJob, getJob, updateJob, addJobToProject, removeJobFromProject, getProject } from '@/lib/storage';
import { captureError } from '@/lib/errors';

/**
 * Transform video URL to proxy URL if it's an R2 key (not starting with http)
 */
function getVideoUrl(jobId: string, url: string | undefined, index: number = 0): string {
  if (!url) return '';
  if (!url.startsWith('http')) {
    return `/api/proxy-video?jobId=${jobId}&index=${index}`;
  }
  return url;
}

function getVideoUrls(jobId: string, urls: string[] | undefined): string[] {
  if (!urls || urls.length === 0) return [];
  return urls.map((url, index) => getVideoUrl(jobId, url, index));
}

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
      videoUrl: getVideoUrl(job.id, job.videoUrl, 0),
      videoUrls: getVideoUrls(job.id, job.videoUrls),
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

// PATCH /api/gallery/[id] - Update favorite or projectId
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

    const updates: { favorite?: boolean; projectId?: string } = {};

    // Handle favorite toggle
    if (body.favorite !== undefined || (!('projectId' in body))) {
      updates.favorite = body.favorite !== undefined ? body.favorite : !job.favorite;
    }

    // Handle project assignment
    if ('projectId' in body) {
      const newProjectId = body.projectId;
      const oldProjectId = job.projectId;

      // Validate new project exists (if not removing)
      if (newProjectId) {
        const project = await getProject(newProjectId);
        if (!project) {
          return NextResponse.json({ error: '找不到該專案' }, { status: 404 });
        }
      }

      // Remove from old project
      if (oldProjectId && oldProjectId !== newProjectId) {
        await removeJobFromProject(oldProjectId, id);
      }

      // Add to new project
      if (newProjectId && newProjectId !== oldProjectId) {
        await addJobToProject(newProjectId, id);
      }

      updates.projectId = newProjectId ?? undefined;
    }

    const updated = await updateJob(id, updates);
    if (!updated) {
      return NextResponse.json({ error: '更新失敗' }, { status: 500 });
    }

    return NextResponse.json({
      id: updated.id,
      favorite: updated.favorite,
      projectId: updated.projectId,
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
