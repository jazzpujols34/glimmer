export const runtime = 'edge';

import { NextRequest } from 'next/server';
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
import { checkCredits, consumeCredit } from '@/lib/credits';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { getTemplateById } from '@/lib/templates';
import { isValidEmail, isValidOccasion, validateName, validatePhoto } from '@/lib/validation';
import { successResponse, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import type { GenerationSettings, OccasionType } from '@/types';
import { defaultSettings } from '@/types';

const MAX_PHOTOS = 20;

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`quick:${ip}`, 3, 60);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return errors.rateLimited(retryAfter);
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
      return errors.invalidEmail();
    }
    if (!templateId) {
      return errors.missingField('templateId');
    }
    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
      return errors.invalidInput(nameValidation.error!);
    }
    if (!occasion || !isValidOccasion(occasion)) {
      return errors.invalidInput('無效的場合');
    }

    // Validate template
    const template = getTemplateById(templateId);
    if (!template) {
      return errors.invalidInput('無效的模板');
    }

    // Extract photos
    const photos: Buffer[] = [];
    const photoFiles = formData.getAll('photos');

    for (const file of photoFiles) {
      if (!(file instanceof Blob)) continue;
      const photoValidation = validatePhoto(file);
      if (!photoValidation.valid) {
        return errors.invalidInput(photoValidation.error!);
      }
      photos.push(Buffer.from(await file.arrayBuffer()));
    }

    if (photos.length < 2) {
      return errors.invalidInput('請上傳至少 2 張照片');
    }
    if (photos.length > MAX_PHOTOS) {
      return errors.invalidInput(`最多只能上傳 ${MAX_PHOTOS} 張照片`);
    }

    const totalSegments = photos.length - 1;

    // Check credits
    const credits = await checkCredits(email);
    if (credits.remaining < totalSegments) {
      return errors.insufficientCredits();
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

    logger.debug('quick-generate', `Created quickJob ${quickJob.id}, batch ${batch.id}, ${totalSegments} segments`);

    // Generate each segment (photo[i] → photo[i+1])
    const segmentResults: { index: number; jobId: string; success: boolean }[] = [];

    for (let i = 0; i < totalSegments; i++) {
      const firstFrame = photos[i];
      const lastFrame = photos[i + 1];

      try {
        // Consume credit for this segment
        const creditResult = await consumeCredit(email, `${batch.id}_${i}`);
        if (!creditResult.success) {
          logger.error(`[quick-generate] Credit consumption failed for segment ${i}`);
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
        logger.debug('quick-generate', `Started segment ${i}, jobId ${jobId}`);
      } catch (err) {
        logger.error(`[quick-generate] Failed to start segment ${i}:`, err);
        segmentResults.push({ index: i, jobId: '', success: false });
      }
    }

    const successCount = segmentResults.filter(r => r.success).length;
    logger.debug('quick-generate', `Started ${successCount}/${totalSegments} segments`);

    return successResponse({
      quickId: quickJob.id,
      batchId: batch.id,
      projectId: project.id,
      totalSegments,
      startedSegments: successCount,
    });

  } catch (error) {
    captureError(error, { route: '/api/quick-generate' });
    logger.error('[quick-generate] Error:', error);
    return errors.serverError();
  }
}
