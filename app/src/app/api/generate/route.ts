export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { createJob } from '@/lib/storage';
import { generateVideo } from '@/lib/veo';
import type { GenerationSettings, OccasionType } from '@/types';
import { defaultSettings } from '@/types';

export async function POST(request: NextRequest) {
  try {
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

    // Parse settings or use defaults
    let settings: GenerationSettings = defaultSettings;
    if (settingsJson) {
      try {
        settings = { ...defaultSettings, ...JSON.parse(settingsJson) };
      } catch {
        console.warn('Failed to parse settings, using defaults');
      }
    }

    // Extract photos from FormData
    const photos: Buffer[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('photo_') && value instanceof Blob) {
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

    // Create job record with metadata for gallery/VOD
    const job = createJob(jobId, {
      name,
      occasion: occasion as OccasionType,
      settings,
    });

    // Log generation request
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

    // Start video generation in background
    generateVideo({ jobId, photos, name, occasion: occasion as OccasionType, settings }).catch(console.error);

    return NextResponse.json({
      id: job.id,
      status: job.status,
    });
  } catch (error) {
    console.error('Generate API error:', error);
    return NextResponse.json(
      { error: '發生錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}
