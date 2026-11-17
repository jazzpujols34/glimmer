import { buildPrompt } from './prompts';
import { logger } from './logger';
import { captureError, ProviderUnavailableError, isProviderUnavailable } from './errors';
import type { GenerationSettings, GenerationJob, OccasionType, ModelType } from '@/types';

// === Public interfaces ===

export interface CreateTaskOptions {
  photos: Buffer[];
  name: string;
  occasion: OccasionType;
  settings: GenerationSettings;
}

export interface ExternalTaskData {
  provider: ModelType;
  externalTaskIds?: string[];
}

export interface TaskCheckResult {
  done: boolean;
  videoUrls?: string[];
  failedCount?: number;   // tasks that failed while others succeeded
  error?: string;
  progress?: number;
}

// === Create task (called by POST /api/generate) ===

/**
 * Creates the external video generation task(s) and returns tracking data.
 * Does NOT poll — returns immediately after the task is created.
 */
export async function createVideoTask(options: CreateTaskOptions): Promise<ExternalTaskData> {
  const { settings } = options;
  const prompt = buildPrompt({
    userPrompt: settings.prompt,
    occasion: options.occasion,
    taskType: settings.taskType,
    name: options.name,
  });

  return createBytePlusTasks(options, prompt);
}

// === Check task status (called by GET /api/status/[id]) ===

/**
 * Checks the status of an external video generation task.
 * Makes ONE API call per invocation — the client's polling loop drives progress.
 */
export async function checkVideoTaskStatus(job: GenerationJob): Promise<TaskCheckResult> {
  if (job.provider !== 'byteplus') return { done: true, error: `Unknown provider: ${job.provider}` };
  return checkBytePlusTasks(job.externalTaskIds || []);
}

// ════════════════════════════════════════════════════════════════
//  BytePlus Seedance
// ════════════════════════════════════════════════════════════════

export interface BytePlusContentItem {
  type: string;
  text?: string;
  image_url?: { url: string };
  role?: string;
}

/**
 * Builds the `content` array for a BytePlus Seedance request.
 * Pure function — no I/O — so it's independently unit-testable.
 *
 * Two-image (first-last-frame) requests MUST tag both images with a role
 * (`first_frame` / `last_frame`) — BytePlus rejects a mixed one-role/one-role-less
 * pair with `role must be specified for image contents`. Single-image requests
 * MUST NOT have a role key — that shape is the proven-working production path.
 */
export function buildBytePlusContent(
  photos: Buffer[],
  prompt: string,
  settings: GenerationSettings,
): BytePlusContentItem[] {
  const resolution = settings.resolution || '720p';
  const duration = Math.min(Math.max(settings.videoLength, 4), 12);
  const aspectRatio = settings.aspectRatio || '16:9';
  const cameraFixed = settings.cameraFixed ?? false;
  const fullPrompt = `${prompt} --resolution ${resolution} --duration ${duration} --ratio ${aspectRatio} --camerafixed ${cameraFixed}`;

  const firstBase64 = photos[0].toString('base64');
  const firstMime = detectMimeType(photos[0]);
  const firstDataUrl = `data:${firstMime};base64,${firstBase64}`;

  const contentArray: BytePlusContentItem[] = [{ type: 'text', text: fullPrompt }];

  if (settings.taskType === 'first-last-frame' && photos.length >= 2) {
    const lastBase64 = photos[1].toString('base64');
    const lastMime = detectMimeType(photos[1]);
    contentArray.push(
      { type: 'image_url', image_url: { url: firstDataUrl }, role: 'first_frame' },
      { type: 'image_url', image_url: { url: `data:${lastMime};base64,${lastBase64}` }, role: 'last_frame' },
    );
  } else {
    contentArray.push({ type: 'image_url', image_url: { url: firstDataUrl } });
  }

  return contentArray;
}

async function createBytePlusTasks(options: CreateTaskOptions, prompt: string): Promise<ExternalTaskData> {
  const { photos, settings } = options;
  const apiKey = process.env.BYTEPLUS_API_KEY;
  const modelId = process.env.BYTEPLUS_MODEL_ID;
  if (!apiKey) throw new Error('BYTEPLUS_API_KEY is not set');
  if (!modelId) throw new Error('BYTEPLUS_MODEL_ID is not set');

  const numVideos = Math.min(Math.max(settings.numResults || 1, 1), 4);
  const contentArray = buildBytePlusContent(photos, prompt, settings);

  // Create all tasks in parallel (faster than sequential)
  const taskIds = await Promise.all(
    Array.from({ length: numVideos }, async () => {
      const res = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        // generate_audio:false halves cost (audio rate $2.4 vs silent $1.2 per M
        // tokens) — glimmer's editor overlays user-chosen music, AI audio is wasted
        body: JSON.stringify({ model: modelId, content: contentArray, generate_audio: false }),
      });
      if (!res.ok) {
        const body = await res.text();
        if (isProviderUnavailable(body)) {
          throw new ProviderUnavailableError(`BytePlus unavailable: ${body}`, 'byteplus');
        }
        throw new Error(`BytePlus create failed: ${res.status} ${body}`);
      }
      const data = await res.json();
      const taskId = data.id || data.task_id;
      if (!taskId) throw new Error('No task ID from BytePlus');
      return taskId as string;
    })
  );

  return { provider: 'byteplus', externalTaskIds: taskIds };
}

/**
 * One status call per task. Only the provider saying "failed" counts as a
 * failure: a status call that cannot be made (429, 5xx, a rotated key) leaves
 * the task pending, because it may still be rendering and billed. settleJob's
 * timeout bounds a task that never answers.
 *
 * Done only when every task has a final answer. Some good, some failed →
 * `videoUrls` holds the good ones and `failedCount` the rest.
 */
export async function checkBytePlusTasks(taskIds: string[]): Promise<TaskCheckResult> {
  const apiKey = process.env.BYTEPLUS_API_KEY;
  if (!apiKey) throw new Error('BYTEPLUS_API_KEY not set');
  if (taskIds.length === 0) return { done: true, error: 'No task IDs' };

  const videoUrls: string[] = [];
  let pending = 0;
  let failedCount = 0;
  let firstError: string | undefined;

  for (const taskId of taskIds) {
    const res = await fetch(`https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      // Logged, not reported: during an outage every poll of every job lands here.
      logger.warn(`[BytePlus] status check for ${taskId} answered ${res.status}; treating as still running`);
      pending++;
      continue;
    }

    const data = await res.json();
    const status = data.status || data.task_status;

    if (status === 'succeeded' || status === 'completed' || status === 'success') {
      const url = data.output?.video_url || data.content?.video_url || data.video_url || data.result?.video_url;
      if (url) {
        videoUrls.push(url);
      } else {
        failedCount++;
        firstError ??= 'No video URL in BytePlus response';
      }
    } else if (status === 'failed' || status === 'error') {
      const rawError = data.error || data.message || 'BytePlus generation failed';
      const errorMsg = typeof rawError === 'object' ? (rawError.message || JSON.stringify(rawError)) : String(rawError);
      captureError(new Error(errorMsg), { provider: 'byteplus', taskId });
      failedCount++;
      firstError ??= errorMsg;
    } else {
      pending++;
    }
  }

  if (pending > 0) {
    const finished = videoUrls.length + failedCount;
    return { done: false, progress: Math.floor((finished / taskIds.length) * 90) + 10 };
  }
  if (videoUrls.length === 0) return { done: true, error: firstError };
  return { done: true, videoUrls, ...(failedCount > 0 && { failedCount, error: firstError }) };
}

function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image/webp';
  return 'image/jpeg';
}
