export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { createJob, updateJob, createProject, addJobToProject, createBatch, addSegmentToBatch, updateBatch, setJobError } from '@/lib/storage';
import { createVideoTask } from '@/lib/veo';
import { checkCredits, consumeCredits, isAdmin } from '@/lib/credits';
import { creditsForGeneration } from '@/lib/credit-cost';
import { checkFreeIpCap, recordFreeIpUsage } from '@/lib/free-ip-cap';
import { checkDailySpendCap, recordProviderSpend, estimatedTokensForGeneration } from '@/lib/spend-guard';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError, normalizeError } from '@/lib/errors';
import { isValidEmail, isValidOccasion, validateSettings, validateName, validatePhoto } from '@/lib/validation';
import { successResponse, errors } from '@/lib/api-response';
import { enforceIdentity } from '@/lib/identity';
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

    // --- Phase 2b enforcement (dormant unless REQUIRE_SESSION_FOR_PAID=true) ---
    const identity = await enforceIdentity(request, email);
    if ('error' in identity) {
      return errors.sessionRequired();
    }
    const actingEmail = identity.email;

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
    const settings = validateSettings(parsedSettings);
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
        const photoValidation = await validatePhoto(value);
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

    // Batch always forces numResults=1 per segment (see settings.numResults
    // below) — cost is still proportional to resolution/duration.
    const perSegmentCost = creditsForGeneration({ ...settings, numResults: 1 });
    const totalCost = totalSegments * perSegmentCost;

    // --- Email verification + credit check ---
    const balance = await checkCredits(actingEmail);
    if (!balance.verified && !isAdmin(actingEmail)) {
      return errors.emailNotVerified();
    }

    // --- Free tier is standard-spec only (720p/5s/x1, perSegmentCost === 1) ---
    // consumeCredits() pays each non-standard-spec segment (amount > 1) from
    // paid credits only, so if paid alone can't cover the whole batch, reject
    // upfront rather than letting segments fail one-by-one mid-batch.
    const paidRemaining = balance.paidTotal - balance.paidUsed;
    if (perSegmentCost > 1 && paidRemaining < totalCost) {
      return errors.freeTierStandardSpecOnly();
    }

    if (balance.remaining < totalCost) {
      return errors.insufficientCredits(totalCost, balance.remaining);
    }

    // --- Per-IP monthly cap on free-tier generations ---
    // Only gates when free is the user's ONLY viable source: perSegmentCost
    // === 1, free tier still has room, AND paid can't cover the batch either.
    // A paying-capable user at a capped IP must still proceed — consumeCredits()
    // is free-first regardless, so their segments may still draw free credits
    // and push the counter past the cap; that's fine, since the cap exists to
    // stop free-only farm accounts, and those (paidRemaining === 0) stay blocked.
    const freeRemaining = Math.max(0, balance.freeTotal - balance.freeUsed);
    if (!balance.isAdmin && perSegmentCost === 1 && freeRemaining > 0 && paidRemaining < totalCost) {
      const ipCap = await checkFreeIpCap(ip);
      if (!ipCap.allowed) {
        return errors.freeTierIpCapReached();
      }
    }

    // --- Daily provider-spend circuit breaker (check BEFORE creating provider tasks) ---
    const perSegmentTokens = estimatedTokensForGeneration({ ...settings, numResults: 1 });
    const spendCap = await checkDailySpendCap();
    if (spendCap.capped) {
      captureError(new Error('Daily provider spend cap reached'), {
        route: '/api/generate-batch',
        email: actingEmail,
      });
      return errors.dailySpendCapReached();
    }

    // --- Auto-create project for this batch ---
    const project = await createProject(`${name} - 批次`, actingEmail, `批次生成：${photos.length} 張照片，${totalSegments} 段影片`);

    // --- Create batch record ---
    const batch = await createBatch(
      name,
      actingEmail,
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
          email: actingEmail,
          ip,
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

        // Record estimated provider spend AFTER this segment's task was actually created
        await recordProviderSpend(perSegmentTokens);

        // Deduct credit for this segment
        const creditResult = await consumeCredits(actingEmail, jobId, perSegmentCost);
        if (creditResult.success) {
          creditsUsed += perSegmentCost;
        }
        if (creditResult.usedFree > 0) {
          await recordFreeIpUsage(ip);
        }

        // Add to project and batch
        await addJobToProject(project.id, jobId);
        await addSegmentToBatch(batch.id, jobId);

        segmentJobIds.push(jobId);

        logger.debug('generate-batch', `Segment ${i + 1}/${totalSegments} created: ${jobId}`);
      } catch (err) {
        logger.error(`[Batch] Failed to create segment ${i + 1}:`, err);
        // Job may already exist in KV as 'queued' (createJob succeeded before
        // a later step threw) — mark it errored so it doesn't stay a zombie.
        await setJobError(jobId, normalizeError(err));
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
