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
  setJobError,
} from '@/lib/storage';
import { createVideoTask } from '@/lib/veo';
import { checkCredits, consumeCredits, refundCredits, isAdmin } from '@/lib/credits';
import { creditsForGeneration } from '@/lib/credit-cost';
import { checkFreeIpCap, recordFreeIpUsage } from '@/lib/free-ip-cap';
import { checkDailySpendCap, recordProviderSpend, estimatedTokensForGeneration } from '@/lib/spend-guard';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError, normalizeError } from '@/lib/errors';
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

    // Build generation settings
    const settings: GenerationSettings = {
      ...defaultSettings,
      taskType: 'first-last-frame',
      numResults: 1,
    };

    // Quick-generate always forces numResults=1 per segment (above) — cost is
    // still proportional to resolution/duration.
    const perSegmentCost = creditsForGeneration(settings);
    const totalCost = totalSegments * perSegmentCost;

    // Email verification + credit check
    const credits = await checkCredits(email);
    if (!credits.verified && !isAdmin(email)) {
      return errors.emailNotVerified();
    }

    // --- Free tier is standard-spec only (perSegmentCost === 1 by construction
    // here, since settings above always force numResults=1/defaultSettings —
    // kept for defensive consistency with the other 2 generation routes) ---
    const paidRemaining = credits.paidTotal - credits.paidUsed;
    if (perSegmentCost > 1 && paidRemaining < totalCost) {
      return errors.freeTierStandardSpecOnly();
    }

    if (credits.remaining < totalCost) {
      return errors.insufficientCredits(totalCost, credits.remaining);
    }

    // --- Per-IP monthly cap on free-tier generations ---
    const freeRemaining = Math.max(0, credits.freeTotal - credits.freeUsed);
    if (!credits.isAdmin && perSegmentCost === 1 && freeRemaining > 0) {
      const ipCap = await checkFreeIpCap(ip);
      if (!ipCap.allowed) {
        return errors.freeTierIpCapReached();
      }
    }

    // --- Daily provider-spend circuit breaker (check BEFORE creating provider tasks) ---
    const perSegmentTokens = estimatedTokensForGeneration(settings);
    const spendCap = await checkDailySpendCap();
    if (spendCap.capped) {
      captureError(new Error('Daily provider spend cap reached'), {
        route: '/api/quick-generate',
        email,
      });
      return errors.dailySpendCapReached();
    }

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
      let jobId: string | undefined;
      let creditResult: { success: boolean; usedFree: number; usedPaid: number } | undefined;

      try {
        // Consume credit for this segment
        creditResult = await consumeCredits(email, `${batch.id}_${i}`, perSegmentCost);
        if (!creditResult.success) {
          logger.error(`[quick-generate] Credit consumption failed for segment ${i}`);
          segmentResults.push({ index: i, jobId: '', success: false });
          continue;
        }
        if (creditResult.usedFree > 0) {
          await recordFreeIpUsage(ip);
        }

        // Create job
        jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const _job = await createJob(jobId, {
          name: `${name} - 片段 ${i + 1}`,
          occasion: occasion as OccasionType,
          settings,
          email,
          ip,
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

        // Record estimated provider spend AFTER this segment's task was actually created
        await recordProviderSpend(perSegmentTokens);

        segmentResults.push({ index: i, jobId, success: true });
        logger.debug('quick-generate', `Started segment ${i}, jobId ${jobId}`);
      } catch (err) {
        logger.error(`[quick-generate] Failed to start segment ${i}:`, err);
        // Credit was consumed BEFORE task creation in this route (unlike
        // generate/generate-batch) — if anything after that succeeded
        // consumeCredits throws, give the credit back so the failure doesn't
        // silently cost the user a generation they never got.
        if (creditResult?.success) {
          await refundCredits(email, `${batch.id}_${i}`, creditResult.usedFree, creditResult.usedPaid);
        }
        // Job may already exist in KV as 'queued' (createJob succeeded before
        // a later step threw) — mark it errored so it doesn't stay a zombie.
        if (jobId) await setJobError(jobId, normalizeError(err));
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
