export const runtime = 'edge';

import { NextRequest } from 'next/server';
import imageSize from 'image-size';
import { createJob, updateJob, addJobToProject, getProject } from '@/lib/storage';
import { createVideoTask } from '@/lib/veo';
import { checkCredits, consumeCredit, isAdmin } from '@/lib/credits';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isValidEmail, isValidOccasion, validateSettings, validateName, validatePhoto, MAX_PHOTO_SIZE } from '@/lib/validation';
import { errorResponse, successResponse, errors } from '@/lib/api-response';
import type { OccasionType } from '@/types';

export async function POST(request: NextRequest) {
  try {
    // --- Rate limiting (5 generate requests per minute per IP) ---
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`gen:${ip}`, 5, 60);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return errors.rateLimited(retryAfter);
    }

    const formData = await request.formData();

    const name = formData.get('name') as string;
    const occasion = formData.get('occasion') as string;
    const settingsJson = formData.get('settings') as string;
    const email = formData.get('email') as string;
    const projectId = formData.get('projectId') as string | null;

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

    // --- Input validation: projectId (optional) ---
    if (projectId) {
      const project = await getProject(projectId);
      if (!project) {
        return errors.notFound('專案');
      }
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

    // Extract photos from FormData
    const photos: Buffer[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('photo_') && value instanceof Blob) {
        // --- Input validation: file size and type ---
        const photoValidation = validatePhoto(value);
        if (!photoValidation.valid) {
          return errors.invalidInput(photoValidation.error!);
        }
        const buffer = Buffer.from(await value.arrayBuffer());
        photos.push(buffer);
      }
    }

    if (photos.length < 1) {
      return errors.invalidInput('請至少上傳 1 張照片');
    }

    if (photos.length > 10) {
      return errors.invalidInput('最多只能上傳 10 張照片');
    }

    // --- Auto-detect aspect ratio from first photo ---
    try {
      const dimensions = imageSize(photos[0]);
      if (dimensions.width && dimensions.height) {
        const isPortrait = dimensions.height > dimensions.width;
        settings.aspectRatio = isPortrait ? '9:16' : '16:9';
        logger.debug('API', `Auto-detected aspect ratio: ${settings.aspectRatio} (${dimensions.width}x${dimensions.height})`);
      }
    } catch {
      logger.warn('[API] Could not detect image dimensions, using default aspect ratio');
    }

    // --- Email verification check (skip for admins) ---
    const balance = await checkCredits(email);
    if (!balance.verified && !isAdmin(email)) {
      return errors.emailNotVerified();
    }

    // --- Credit check (fail fast before creating job) ---
    if (balance.remaining <= 0) {
      return errors.insufficientCredits();
    }

    // Generate job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create job record in KV
    await createJob(jobId, {
      name,
      occasion: occasion as OccasionType,
      settings,
      email,
    });

    logger.debug('API', `Starting generation job ${jobId}`, {
      name,
      occasion,
      photoCount: photos.length,
      model: settings.model,
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

    // Deduct credit AFTER external task creation succeeds
    const creditResult = await consumeCredit(email, jobId);
    if (!creditResult.success) {
      // Shouldn't happen (we checked above), but log defensively
      logger.error(`[API] Credit deduction failed for ${email} on job ${jobId}`);
    }

    // Add job to project if projectId provided
    if (projectId) {
      await addJobToProject(projectId, jobId);
    }

    return successResponse({
      id: jobId,
      status: 'processing',
      projectId: projectId || undefined,
    });
  } catch (error) {
    captureError(error, { route: '/api/generate' });
    return errors.serverError();
  }
}
