export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { createJob, updateJob } from '@/lib/storage';
import { createVideoTask } from '@/lib/veo';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import type { GenerationSettings, OccasionType } from '@/types';
import { defaultSettings } from '@/types';

// Allowed values for server-side validation
const VALID_OCCASIONS = ['memorial', 'birthday', 'wedding', 'pet', 'other'];
const VALID_MODELS = ['veo-3.1', 'veo-3.1-fast', 'kling-ai', 'byteplus'];
const VALID_ASPECT_RATIOS = ['16:9', '9:16'];
const VALID_RESOLUTIONS = ['720p', '1080p'];
const VALID_TASK_TYPES = ['image-to-video', 'first-last-frame'];
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB per photo
const MAX_NAME_LENGTH = 100;
const MAX_PROMPT_LENGTH = 500;

export async function POST(request: NextRequest) {
  try {
    // --- Rate limiting (5 generate requests per minute per IP) ---
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`gen:${ip}`, 5, 60);
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

    if (!name || !occasion) {
      return NextResponse.json(
        { error: '請提供完整資訊' },
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
    let settings: GenerationSettings = defaultSettings;
    if (settingsJson) {
      try {
        settings = { ...defaultSettings, ...JSON.parse(settingsJson) };
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
    if (!VALID_TASK_TYPES.includes(settings.taskType)) {
      settings.taskType = defaultSettings.taskType;
    }
    // Clamp numResults to 1-4
    settings.numResults = Math.max(1, Math.min(4, Math.floor(settings.numResults || 1)));
    // Clamp videoLength to 2-12 seconds
    settings.videoLength = Math.max(2, Math.min(12, Math.floor(settings.videoLength || 5)));
    // Sanitize prompt
    if (settings.prompt && settings.prompt.length > MAX_PROMPT_LENGTH) {
      settings.prompt = settings.prompt.slice(0, MAX_PROMPT_LENGTH);
    }

    // Extract photos from FormData
    const photos: Buffer[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('photo_') && value instanceof Blob) {
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
        photos.push(buffer);
      }
    }

    if (photos.length < 1) {
      return NextResponse.json(
        { error: '請至少上傳 1 張照片' },
        { status: 400 }
      );
    }

    if (photos.length > 10) {
      return NextResponse.json(
        { error: '最多只能上傳 10 張照片' },
        { status: 400 }
      );
    }

    // Generate job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create job record in KV
    await createJob(jobId, {
      name,
      occasion: occasion as OccasionType,
      settings,
    });

    console.log(`[API] Starting generation job ${jobId}`, {
      name,
      occasion,
      photoCount: photos.length,
      settings: {
        model: settings.model,
        taskType: settings.taskType,
        aspectRatio: settings.aspectRatio,
        videoLength: settings.videoLength,
        resolution: settings.resolution,
        numResults: settings.numResults,
      },
    });

    // Create external video task — returns immediately with tracking data
    const taskData = await createVideoTask({
      photos,
      name,
      occasion: occasion as OccasionType,
      settings,
    });

    // Save external task tracking data to KV
    await updateJob(jobId, {
      status: 'processing',
      progress: 10,
      provider: taskData.provider,
      externalTaskIds: taskData.externalTaskIds,
      veoOperationName: taskData.veoOperationName,
    });

    return NextResponse.json({
      id: jobId,
      status: 'processing',
    });
  } catch (error) {
    console.error('Generate API error:', error);
    return NextResponse.json(
      { error: '發生錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}
