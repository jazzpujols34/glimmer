export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { createJob, updateJob, createProject, addJobToProject, createBatch, addSegmentToBatch, updateBatch } from '@/lib/storage';
import { createVideoTask } from '@/lib/veo';
import { checkCredits, consumeCredit, isValidEmail } from '@/lib/credits';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import type { GenerationSettings, OccasionType } from '@/types';
import { defaultSettings } from '@/types';

// Allowed values for server-side validation
const VALID_OCCASIONS = ['memorial', 'birthday', 'wedding', 'pet', 'other'];
const VALID_MODELS = ['veo-3.1', 'veo-3.1-fast', 'kling-ai', 'byteplus'];
const VALID_ASPECT_RATIOS = ['16:9', '9:16'];
const VALID_RESOLUTIONS = ['720p', '1080p'];
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB per photo
const MAX_NAME_LENGTH = 100;
const MAX_PROMPT_LENGTH = 500;

export async function POST(request: NextRequest) {
  try {
    // --- Rate limiting (3 batch requests per minute per IP) ---
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`batch:${ip}`, 3, 60);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return NextResponse.json(
        { error: '請求過於頻繁，請稍後再試 (Rate limit exceeded)' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const formData = await request.formData();

    const name = formData.get('name') as string;
    const occasion = formData.get('occasion') as string;
    const settingsJson = formData.get('settings') as string;
    const email = formData.get('email') as string;

    if (!name || !occasion) {
      return NextResponse.json(
        { error: '請提供完整資訊' },
        { status: 400 }
      );
    }

    // --- Email validation ---
    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: '請提供有效的 Email 地址' },
        { status: 400 }
      );
    }

    // --- Input validation: name ---
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `姓名不得超過 ${MAX_NAME_LENGTH} 個字元` },
        { status: 400 }
      );
    }

    // --- Input validation: occasion ---
    if (!VALID_OCCASIONS.includes(occasion)) {
      return NextResponse.json(
        { error: '無效的場合類型' },
        { status: 400 }
      );
    }

    // Parse settings or use defaults
    let settings: GenerationSettings = { ...defaultSettings, taskType: 'first-last-frame' };
    if (settingsJson) {
      try {
        const parsed = JSON.parse(settingsJson);
        settings = { ...settings, ...parsed, taskType: 'first-last-frame' }; // Force first-last-frame
      } catch {
        console.warn('Failed to parse settings, using defaults');
      }
    }

    // --- Input validation: settings ---
    if (!VALID_MODELS.includes(settings.model)) {
      settings.model = defaultSettings.model;
    }
    if (!VALID_ASPECT_RATIOS.includes(settings.aspectRatio)) {
      settings.aspectRatio = defaultSettings.aspectRatio;
    }
    if (!VALID_RESOLUTIONS.includes(settings.resolution)) {
      settings.resolution = defaultSettings.resolution;
    }
    // Force single result per segment (each segment = 1 video)
    settings.numResults = 1;
    // Clamp videoLength to 2-12 seconds
    settings.videoLength = Math.max(2, Math.min(12, Math.floor(settings.videoLength || 5)));
    // Sanitize prompt
    if (settings.prompt && settings.prompt.length > MAX_PROMPT_LENGTH) {
      settings.prompt = settings.prompt.slice(0, MAX_PROMPT_LENGTH);
    }

    // Extract photos from FormData (must be ordered: photo_0, photo_1, ...)
    const photoMap: Map<number, Buffer> = new Map();
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('photo_') && value instanceof Blob) {
        const index = parseInt(key.replace('photo_', ''), 10);
        if (isNaN(index)) continue;

        // --- Input validation: file size ---
        if (value.size > MAX_PHOTO_SIZE) {
          return NextResponse.json(
            { error: `照片大小不得超過 ${MAX_PHOTO_SIZE / 1024 / 1024} MB` },
            { status: 400 }
          );
        }
        // --- Input validation: file type ---
        const type = value.type;
        if (!type.startsWith('image/')) {
          return NextResponse.json(
            { error: '僅接受圖片檔案 (Only image files are accepted)' },
            { status: 400 }
          );
        }
        const buffer = Buffer.from(await value.arrayBuffer());
        photoMap.set(index, buffer);
      }
    }

    // Convert to ordered array
    const photos: Buffer[] = [];
    const maxIndex = Math.max(...Array.from(photoMap.keys()));
    for (let i = 0; i <= maxIndex; i++) {
      const photo = photoMap.get(i);
      if (photo) photos.push(photo);
    }

    // Batch requires at least 2 photos
    if (photos.length < 2) {
      return NextResponse.json(
        { error: '批次生成需要至少 2 張照片' },
        { status: 400 }
      );
    }

    if (photos.length > 10) {
      return NextResponse.json(
        { error: '最多只能上傳 10 張照片' },
        { status: 400 }
      );
    }

    // N photos = N-1 segments
    const totalSegments = photos.length - 1;

    // --- Credit check (need N-1 credits) ---
    const balance = await checkCredits(email);
    if (balance.remaining < totalSegments) {
      return NextResponse.json(
        {
          error: `點數不足，需要 ${totalSegments} 點，您目前有 ${balance.remaining} 點`,
          code: 'INSUFFICIENT_CREDITS',
          required: totalSegments,
          available: balance.remaining,
        },
        { status: 402 }
      );
    }

    // --- Auto-create project for this batch ---
    const project = await createProject(`${name} - 批次`, email, `批次生成：${photos.length} 張照片，${totalSegments} 段影片`);

    // --- Create batch record ---
    const batch = await createBatch(
      name,
      email,
      occasion as OccasionType,
      settings,
      totalSegments,
      project.id,
    );

    console.log(`[API] Starting batch generation ${batch.id}`, {
      name,
      occasion,
      photoCount: photos.length,
      totalSegments,
      projectId: project.id,
      settings: {
        model: settings.model,
        aspectRatio: settings.aspectRatio,
        videoLength: settings.videoLength,
      },
    });

    // --- Create segment jobs ---
    const segmentJobIds: string[] = [];
    let creditsUsed = 0;
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < totalSegments; i++) {
      const firstFrame = photos[i];
      const lastFrame = photos[i + 1];

      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      try {
        // Create job record
        await createJob(jobId, {
          name: `${name} - 段落 ${i + 1}`,
          occasion: occasion as OccasionType,
          settings,
          email,
        });

        // Update job with batch reference
        await updateJob(jobId, {
          batchId: batch.id,
          segmentIndex: i,
          projectId: project.id,
        });

        // Create external video task with first-last-frame
        const taskData = await createVideoTask({
          photos: [firstFrame, lastFrame],
          name: `${name} - 段落 ${i + 1}`,
          occasion: occasion as OccasionType,
          settings,
        });

        // Update job with external task data
        await updateJob(jobId, {
          status: 'processing',
          progress: 10,
          provider: taskData.provider,
          externalTaskIds: taskData.externalTaskIds,
          veoOperationName: taskData.veoOperationName,
        });

        // Deduct credit for this segment
        const creditResult = await consumeCredit(email, jobId);
        if (creditResult.success) {
          creditsUsed++;
        }

        // Add to project and batch
        await addJobToProject(project.id, jobId);
        await addSegmentToBatch(batch.id, jobId);

        segmentJobIds.push(jobId);

        console.log(`[Batch] Segment ${i + 1}/${totalSegments} created: ${jobId}`);
      } catch (err) {
        console.error(`[Batch] Failed to create segment ${i + 1}:`, err);
        errors.push({
          index: i,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        // Continue with other segments
      }
    }

    // Update batch status
    if (segmentJobIds.length === 0) {
      // All segments failed
      await updateBatch(batch.id, { status: 'error' });
      return NextResponse.json(
        { error: '所有段落建立失敗，請稍後再試' },
        { status: 500 }
      );
    }

    await updateBatch(batch.id, { status: 'processing' });

    return NextResponse.json({
      batchId: batch.id,
      projectId: project.id,
      segmentJobIds,
      totalSegments,
      createdSegments: segmentJobIds.length,
      creditsUsed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    captureError(error, { route: '/api/generate-batch' });
    return NextResponse.json(
      { error: '發生錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}
