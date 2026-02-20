export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import {
  createJob,
  updateJob,
  createProject,
  addJobToProject,
  createBatch,
  addSegmentToBatch,
  createQuickJob,
} from '@/lib/storage';
import { createVideoTask } from '@/lib/veo';
import { checkCredits, consumeCredit, isValidEmail } from '@/lib/credits';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { getTemplateById } from '@/lib/templates';
import type { GenerationSettings, OccasionType } from '@/types';
import { defaultSettings } from '@/types';

const VALID_OCCASIONS = ['memorial', 'birthday', 'wedding', 'pet', 'other'];
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_PHOTOS = 20;
const MAX_NAME_LENGTH = 100;

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`quick:${ip}`, 3, 60);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: '請求過於頻繁，請稍後再試' },
        { status: 429 }
      );
    }

    const formData = await request.formData();

    const email = formData.get('email') as string;
    const templateId = formData.get('templateId') as string;
    const name = formData.get('name') as string;
    const date = formData.get('date') as string || undefined;
    const message = formData.get('message') as string || undefined;
    const occasion = formData.get('occasion') as string;

    // Validate required fields
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: '請提供有效的 Email' }, { status: 400 });
    }
    if (!templateId) {
      return NextResponse.json({ error: '請選擇模板' }, { status: 400 });
    }
    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: '請提供名稱' }, { status: 400 });
    }
    if (!occasion || !VALID_OCCASIONS.includes(occasion)) {
      return NextResponse.json({ error: '無效的場合' }, { status: 400 });
    }

    // Validate template
    const template = getTemplateById(templateId);
    if (!template) {
      return NextResponse.json({ error: '無效的模板' }, { status: 400 });
    }

    // Extract photos
    const photos: Buffer[] = [];
    const photoFiles = formData.getAll('photos');

    for (const file of photoFiles) {
      if (!(file instanceof Blob)) continue;
      if (file.size > MAX_PHOTO_SIZE) {
        return NextResponse.json({ error: '照片大小不得超過 10 MB' }, { status: 400 });
      }
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: '僅接受圖片檔案' }, { status: 400 });
      }
      photos.push(Buffer.from(await file.arrayBuffer()));
    }

    if (photos.length < 2) {
      return NextResponse.json({ error: '請上傳至少 2 張照片' }, { status: 400 });
    }
    if (photos.length > MAX_PHOTOS) {
      return NextResponse.json({ error: `最多只能上傳 ${MAX_PHOTOS} 張照片` }, { status: 400 });
    }

    const totalSegments = photos.length - 1;

    // Check credits
    const credits = await checkCredits(email);
    if (credits.remaining < totalSegments) {
      return NextResponse.json(
        { error: `點數不足，需要 ${totalSegments} 點，剩餘 ${credits.remaining} 點` },
        { status: 402 }
      );
    }

    // Build generation settings
    const settings: GenerationSettings = {
      ...defaultSettings,
      taskType: 'first-last-frame',
      numResults: 1,
    };

    // Create project to group all segments
    const project = await createProject(`快速生成：${name}`, email);

    // Create batch job
    const batch = await createBatch(
      name,
      email,
      occasion as OccasionType,
      settings,
      totalSegments,
      project.id,
    );

    // Create quick job to track the overall process
    const quickJob = await createQuickJob(
      email,
      templateId,
      name,
      batch.id,
      date,
      message,
    );

    console.log(`[quick-generate] Created quickJob ${quickJob.id}, batch ${batch.id}, ${totalSegments} segments`);

    // Generate each segment (photo[i] → photo[i+1])
    const segmentResults: { index: number; jobId: string; success: boolean }[] = [];

    for (let i = 0; i < totalSegments; i++) {
      const firstFrame = photos[i];
      const lastFrame = photos[i + 1];

      try {
        // Consume credit for this segment
        const creditResult = await consumeCredit(email, `${batch.id}_${i}`);
        if (!creditResult.success) {
          console.error(`[quick-generate] Credit consumption failed for segment ${i}`);
          segmentResults.push({ index: i, jobId: '', success: false });
          continue;
        }

        // Create job
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const job = await createJob(jobId, {
          name: `${name} - 片段 ${i + 1}`,
          occasion: occasion as OccasionType,
          settings,
          email,
        });

        // Add to project and batch
        await addJobToProject(project.id, jobId);
        await addSegmentToBatch(batch.id, jobId);
        await updateJob(jobId, { projectId: project.id, segmentIndex: i, batchId: batch.id });

        // Create video task with first-last-frame mode
        const taskResult = await createVideoTask({
          photos: [firstFrame, lastFrame],
          name: `${name} - 片段 ${i + 1}`,
          occasion: occasion as OccasionType,
          settings,
        });

        // Update job with external task data
        await updateJob(jobId, {
          status: 'processing',
          progress: 10,
          provider: taskResult.provider,
          externalTaskIds: taskResult.externalTaskIds,
          veoOperationName: taskResult.veoOperationName,
        });

        segmentResults.push({ index: i, jobId, success: true });
        console.log(`[quick-generate] Started segment ${i}, jobId ${jobId}`);
      } catch (err) {
        console.error(`[quick-generate] Failed to start segment ${i}:`, err);
        segmentResults.push({ index: i, jobId: '', success: false });
      }
    }

    const successCount = segmentResults.filter(r => r.success).length;
    console.log(`[quick-generate] Started ${successCount}/${totalSegments} segments`);

    return NextResponse.json({
      success: true,
      quickId: quickJob.id,
      batchId: batch.id,
      projectId: project.id,
      totalSegments,
      startedSegments: successCount,
    });

  } catch (error) {
    captureError(error, { route: '/api/quick-generate' });
    console.error('[quick-generate] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失敗' },
      { status: 500 }
    );
  }
}
