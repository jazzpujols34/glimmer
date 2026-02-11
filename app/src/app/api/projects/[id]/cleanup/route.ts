export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getProject, getProjectJobs, deleteJob, updateProject } from '@/lib/storage';
import { r2Delete } from '@/lib/r2';
import { captureError } from '@/lib/errors';

// DELETE /api/projects/[id]/cleanup - Delete all non-favorite jobs in project
export async function DELETE(
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
    const toDelete = jobs.filter(job => !job.favorite);
    const toKeep = jobs.filter(job => job.favorite);

    if (toDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        kept: toKeep.length,
        message: '沒有需要刪除的影片',
      });
    }

    // Delete non-favorite jobs and their R2 videos
    for (const job of toDelete) {
      // Delete R2 videos (try up to 4 video indices)
      for (let i = 0; i < 4; i++) {
        await r2Delete(`videos/${job.id}/${i}.mp4`);
      }
      await deleteJob(job.id);
    }

    // Update project's jobIds to only keep favorites
    const keptJobIds = toKeep.map(job => job.id);
    await updateProject(id, {
      jobIds: keptJobIds,
      coverJobId: keptJobIds[0], // Update cover to first remaining job
    });

    return NextResponse.json({
      success: true,
      deleted: toDelete.length,
      kept: toKeep.length,
      message: `已刪除 ${toDelete.length} 個非收藏影片`,
    });
  } catch (error) {
    captureError(error, { route: '/api/projects/[id]/cleanup' });
    return NextResponse.json({ error: '發生錯誤' }, { status: 500 });
  }
}
