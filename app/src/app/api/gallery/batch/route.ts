export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getJob, deleteJob, getProject, addJobToProject, removeJobFromProject } from '@/lib/storage';
import { captureError } from '@/lib/errors';

// POST /api/gallery/batch - Batch move or delete jobs
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, jobIds, projectId } = body;

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: '請選取至少一支影片' }, { status: 400 });
    }

    if (jobIds.length > 50) {
      return NextResponse.json({ error: '一次最多操作 50 支影片' }, { status: 400 });
    }

    if (action === 'move') {
      // projectId = null means move back to gallery (no project)
      // projectId = "project_xxx" means move to that project
      if (projectId) {
        const project = await getProject(projectId);
        if (!project) {
          return NextResponse.json({ error: '找不到該專案' }, { status: 404 });
        }
      }

      let moved = 0;
      for (const jobId of jobIds) {
        const job = await getJob(jobId);
        if (!job) continue;

        const oldProjectId = job.projectId;

        // Skip if already in the target location
        if ((oldProjectId || null) === (projectId || null)) continue;

        // Remove from old project
        if (oldProjectId) {
          await removeJobFromProject(oldProjectId, jobId);
        }

        // Add to new project (also sets job.projectId)
        if (projectId) {
          await addJobToProject(projectId, jobId);
        }

        moved++;
      }

      return NextResponse.json({ success: true, moved });
    }

    if (action === 'delete') {
      let deleted = 0;
      for (const jobId of jobIds) {
        const job = await getJob(jobId);
        if (!job) continue;

        // Remove from project if in one
        if (job.projectId) {
          await removeJobFromProject(job.projectId, jobId);
        }

        await deleteJob(jobId);
        deleted++;
      }

      return NextResponse.json({ success: true, deleted });
    }

    return NextResponse.json({ error: '無效的操作' }, { status: 400 });
  } catch (error) {
    captureError(error, { route: '/api/gallery/batch' });
    return NextResponse.json({ error: '批次操作失敗' }, { status: 500 });
  }
}
