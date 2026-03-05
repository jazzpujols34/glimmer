export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { createJob, updateJob, createProject, addJobToProject, createBatch, addSegmentToBatch, updateBatch } from '@/lib/storage';
import { createVideoTask } from '@/lib/veo';
import { checkCredits, consumeCredit, isAdmin } from '@/lib/credits';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { isValidEmail, isValidOccasion, validateSettings, validateName, validatePhoto } from '@/lib/validation';
import { successResponse, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import type { OccasionType } from '@/types';

export async function POST(request: NextRequest) {
  try {
    // --- Rate limiting (3 batch requests per minute per IP) ---
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`batch:${ip}`, 3, 60);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return errors.rateLimited(retryAfter);
    }

    const formData = await request.formData();

    const name = formData.get('name') as string;
    const occasion = formData.get('occasion') as string;
    const settingsJson = formData.get('settings') as string;
    const email = formData.get('email') as string;

    if (!name || !occasion) {
      return errors.missingField('name/occasion');
    }

    // --- Email validation ---
    if (!email || !isValidEmail(email)) {
      return errors.invalidEmail();
    }

    // --- Input validation: name ---
    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
      return errors.invalidInput(nameValidation.error!);
    }

    // --- Input validation: occasion ---
    if (!isValidOccasion(occasion)) {
      return errors.invalidInput('無效的場合類型');
    }

    // Parse and validate settings (applies defaults and sanitization)
    let parsedSettings = null;
    if (settingsJson) {
      try {
        parsedSettings = JSON.parse(settingsJson);
      } catch {
        logger.warn('Failed to parse settings, using defaults');
      }
    }
    let settings = validateSettings(parsedSettings);
    // Force first-last-frame mode and single result for batch
    settings.taskType = 'first-last-frame';
    settings.numResults = 1;

    // Extract photos from FormData (must be ordered: photo_0, photo_1, ...)
    const photoMap: Map<number, Buffer> = new Map();
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('photo_') && value instanceof Blob) {
        const index = parseInt(key.replace('photo_', ''), 10);
        if (isNaN(index)) continue;

        // --- Input validation: file size and type ---
        const photoValidation = validatePhoto(value);
        if (!photoValidation.valid) {
          return errors.invalidInput(photoValidation.error!);
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
      return errors.invalidInput('批次生成需要至少 2 張照片');
    }

    if (photos.length > 10) {
      return errors.invalidInput('最多只能上傳 10 張照片');
    }

    // N photos = N-1 segments
    const totalSegments = photos.length - 1;

    // --- Email verification + credit check ---
    const balance = await checkCredits(email);
    if (!balance.verified && !isAdmin(email)) {
      return errors.emailNotVerified();
    }
    if (balance.remaining < totalSegments) {
      return errors.insufficientCredits();
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

    logger.debug('generate-batch', `Starting batch generation ${batch.id}`, {
      name,
      occasion,
      photoCount: photos.length,
      totalSegments,
      projectId: project.id,
    });

    // --- Create segment jobs ---
    const segmentJobIds: string[] = [];
    let creditsUsed = 0;
    const segmentErrors: { index: number; error: string }[] = [];

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

        logger.debug('generate-batch', `Segment ${i + 1}/${totalSegments} created: ${jobId}`);
      } catch (err) {
        logger.error(`[Batch] Failed to create segment ${i + 1}:`, err);
        segmentErrors.push({
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
      return errors.serverError();
    }

    await updateBatch(batch.id, { status: 'processing' });

    return successResponse({
      batchId: batch.id,
      projectId: project.id,
      segmentJobIds,
      totalSegments,
      createdSegments: segmentJobIds.length,
      creditsUsed,
      errors: segmentErrors.length > 0 ? segmentErrors : undefined,
    });
  } catch (error) {
    captureError(error, { route: '/api/generate-batch' });
    return errors.serverError();
  }
}
