export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject, getProjectJobs, deleteJob } from '@/lib/storage';
import { r2Delete } from '@/lib/r2';
import { captureError } from '@/lib/errors';

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

// GET /api/projects/[id] - Get project with its jobs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await getProject(id);

    if (!project) {
      return NextResponse.json({ error: '找不到該專案' }, { status: 404 });
    }

    const jobs = await getProjectJobs(id);

    // Transform video URLs for R2 compatibility
    const transformedJobs = jobs.map(job => ({
      ...job,
      videoUrl: getVideoUrl(job.id, job.videoUrl, 0),
      videoUrls: getVideoUrls(job.id, job.videoUrls),
    }));

    return NextResponse.json({ project, jobs: transformedJobs });
  } catch (error) {
    captureError(error, { route: '/api/projects/[id]' });
    return NextResponse.json({ error: '發生錯誤' }, { status: 500 });
  }
}

// PATCH /api/projects/[id] - Update project name/description
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, coverJobId } = body;

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: '找不到該專案' }, { status: 404 });
    }

    const updates: Partial<typeof project> = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: '請提供有效的專案名稱' }, { status: 400 });
      }
      if (name.length > 100) {
        return NextResponse.json({ error: '專案名稱不得超過 100 個字元' }, { status: 400 });
      }
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = description;
    }
    if (coverJobId !== undefined) {
      updates.coverJobId = coverJobId;
    }

    const updated = await updateProject(id, updates);
    return NextResponse.json({ project: updated });
  } catch (error) {
    captureError(error, { route: '/api/projects/[id]' });
    return NextResponse.json({ error: '發生錯誤' }, { status: 500 });
  }
}

// DELETE /api/projects/[id] - Delete project and optionally its jobs
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const deleteJobs = searchParams.get('deleteJobs') === 'true';

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: '找不到該專案' }, { status: 404 });
    }

    // Optionally delete all jobs in the project
    if (deleteJobs) {
      for (const jobId of project.jobIds) {
        // Delete R2 videos
        for (let i = 0; i < 4; i++) {
          await r2Delete(`videos/${jobId}/${i}.mp4`);
        }
        await deleteJob(jobId);
      }
    }

    await deleteProject(id);
    return NextResponse.json({ success: true, deletedJobs: deleteJobs ? project.jobIds.length : 0 });
  } catch (error) {
    captureError(error, { route: '/api/projects/[id]' });
    return NextResponse.json({ error: '發生錯誤' }, { status: 500 });
  }
}
