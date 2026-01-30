import { GoogleGenAI } from '@google/genai';
import { buildPrompt } from './prompts';
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
  veoOperationName?: string;
}

export interface TaskCheckResult {
  done: boolean;
  videoUrls?: string[];
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

  switch (settings.model) {
    case 'byteplus':
      return createBytePlusTasks(options, prompt);
    case 'veo-3.1':
      return createVeoTask(options, prompt, 'veo-3.1-generate-001');
    case 'veo-3.1-fast':
      return createVeoTask(options, prompt, 'veo-3.1-fast-generate-001');
    case 'kling-ai':
      return createKlingTask(options, prompt);
    default:
      return createBytePlusTasks(options, prompt);
  }
}

// === Check task status (called by GET /api/status/[id]) ===

/**
 * Checks the status of an external video generation task.
 * Makes ONE API call per invocation — the client's polling loop drives progress.
 */
export async function checkVideoTaskStatus(job: GenerationJob): Promise<TaskCheckResult> {
  switch (job.provider) {
    case 'byteplus':
      return checkBytePlusTasks(job.externalTaskIds || []);
    case 'veo-3.1':
    case 'veo-3.1-fast':
      return checkVeoTask(job.veoOperationName || '');
    case 'kling-ai':
      return checkKlingTask(job.externalTaskIds?.[0] || '');
    default:
      return { done: true, error: `Unknown provider: ${job.provider}` };
  }
}

// ════════════════════════════════════════════════════════════════
//  BytePlus Seedance
// ════════════════════════════════════════════════════════════════

interface BytePlusContentItem {
  type: string;
  text?: string;
  image_url?: { url: string };
  role?: string;
}

async function createBytePlusTasks(options: CreateTaskOptions, prompt: string): Promise<ExternalTaskData> {
  const { photos, settings } = options;
  const apiKey = process.env.BYTEPLUS_API_KEY;
  const modelId = process.env.BYTEPLUS_MODEL_ID;
  if (!apiKey) throw new Error('BYTEPLUS_API_KEY is not set');
  if (!modelId) throw new Error('BYTEPLUS_MODEL_ID is not set');

  const numVideos = Math.min(Math.max(settings.numResults || 1, 1), 4);
  const imageBase64 = photos[0].toString('base64');
  const mimeType = detectMimeType(photos[0]);
  const imageDataUrl = `data:${mimeType};base64,${imageBase64}`;

  const resolution = settings.resolution || '720p';
  const duration = Math.min(Math.max(settings.videoLength, 2), 12);
  const aspectRatio = settings.aspectRatio || '16:9';
  const cameraFixed = settings.cameraFixed ?? false;
  const fullPrompt = `${prompt} --resolution ${resolution} --duration ${duration} --ratio ${aspectRatio} --camerafixed ${cameraFixed}`;

  const contentArray: BytePlusContentItem[] = [
    { type: 'text', text: fullPrompt },
    { type: 'image_url', image_url: { url: imageDataUrl } },
  ];

  if (settings.taskType === 'first-last-frame' && photos.length >= 2) {
    const lastBase64 = photos[1].toString('base64');
    const lastMime = detectMimeType(photos[1]);
    contentArray.push({
      type: 'image_url',
      image_url: { url: `data:${lastMime};base64,${lastBase64}` },
      role: 'last_frame',
    });
  }

  // Create all tasks in parallel (faster than sequential)
  const taskIds = await Promise.all(
    Array.from({ length: numVideos }, async () => {
      const res = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: modelId, content: contentArray }),
      });
      if (!res.ok) throw new Error(`BytePlus create failed: ${res.status} ${await res.text()}`);
      const data = await res.json();
      const taskId = data.id || data.task_id;
      if (!taskId) throw new Error('No task ID from BytePlus');
      return taskId as string;
    })
  );

  return { provider: 'byteplus', externalTaskIds: taskIds };
}

async function checkBytePlusTasks(taskIds: string[]): Promise<TaskCheckResult> {
  const apiKey = process.env.BYTEPLUS_API_KEY;
  if (!apiKey) return { done: true, error: 'BYTEPLUS_API_KEY not set' };
  if (taskIds.length === 0) return { done: true, error: 'No task IDs' };

  const videoUrls: string[] = [];
  let pending = 0;

  for (const taskId of taskIds) {
    const res = await fetch(`https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) return { done: true, error: `BytePlus status check failed: ${res.status}` };

    const data = await res.json();
    const status = data.status || data.task_status;

    if (status === 'succeeded' || status === 'completed' || status === 'success') {
      const url = data.output?.video_url || data.content?.video_url || data.video_url || data.result?.video_url;
      if (url) videoUrls.push(url);
      else return { done: true, error: 'No video URL in BytePlus response' };
    } else if (status === 'failed' || status === 'error') {
      return { done: true, error: data.error || data.message || 'BytePlus generation failed' };
    } else {
      pending++;
    }
  }

  if (pending === 0 && videoUrls.length === taskIds.length) {
    return { done: true, videoUrls };
  }

  const progress = Math.floor((videoUrls.length / taskIds.length) * 90) + 10;
  return { done: false, progress };
}

// ════════════════════════════════════════════════════════════════
//  Google Veo 3.1
// ════════════════════════════════════════════════════════════════

function getVertexAIClient(): GoogleGenAI {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT not set');
  return new GoogleGenAI({ vertexai: true, project, location });
}

async function createVeoTask(options: CreateTaskOptions, prompt: string, modelName: string): Promise<ExternalTaskData> {
  const { photos, settings } = options;
  const ai = getVertexAIClient();
  const imageBase64 = photos[0].toString('base64');
  const mimeType = detectMimeType(photos[0]);

  const operation = await ai.models.generateVideos({
    model: modelName,
    prompt,
    image: { imageBytes: imageBase64, mimeType },
    config: {
      aspectRatio: settings.aspectRatio,
      numberOfVideos: settings.numResults,
      durationSeconds: 8,
      personGeneration: 'allow_adult',
      generateAudio: true,
      ...(settings.seed !== undefined && { seed: settings.seed }),
    },
  });

  const provider = modelName.includes('fast') ? 'veo-3.1-fast' : 'veo-3.1';
  return { provider: provider as ModelType, veoOperationName: operation.name || '' };
}

async function checkVeoTask(operationName: string): Promise<TaskCheckResult> {
  if (!operationName) return { done: true, error: 'No Veo operation name' };

  const ai = getVertexAIClient();
  const operation = await ai.operations.getVideosOperation({
    operation: { name: operationName } as never,
  });

  if (!operation.done) {
    return { done: false, progress: 50 };
  }

  const response = operation.response;
  if (response?.raiMediaFilteredCount && response.raiMediaFilteredCount > 0) {
    const reasons = response.raiMediaFilteredReasons?.join(', ') || 'Unknown';
    return { done: true, error: `Content filtered: ${reasons}` };
  }

  if (response?.generatedVideos && response.generatedVideos.length > 0) {
    const videoUrls: string[] = [];
    for (const vid of response.generatedVideos) {
      if (vid.video?.uri) videoUrls.push(vid.video.uri);
      else if (vid.video?.videoBytes) videoUrls.push(`data:video/mp4;base64,${vid.video.videoBytes}`);
    }
    if (videoUrls.length > 0) return { done: true, videoUrls };
  }

  if (operation.error) {
    return { done: true, error: `Veo error: ${JSON.stringify(operation.error)}` };
  }

  return { done: true, error: 'No videos in Veo response' };
}

// ════════════════════════════════════════════════════════════════
//  Kling AI
// ════════════════════════════════════════════════════════════════

async function createKlingTask(options: CreateTaskOptions, prompt: string): Promise<ExternalTaskData> {
  const { photos, settings } = options;
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error('Kling AI credentials not set');

  const imageBase64 = photos[0].toString('base64');
  const token = await getKlingToken(accessKey, secretKey);
  const klingDuration = settings.videoLength <= 5 ? '5' : '10';

  const res = await fetch('https://api.klingai.com/v1/videos/image2video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      model_name: 'kling-v1-5',
      image: imageBase64,
      prompt,
      negative_prompt: 'blurry, distorted, unnatural movements, dramatic changes, morphing',
      cfg_scale: 0.5,
      mode: 'std',
      duration: klingDuration,
      aspect_ratio: settings.aspectRatio,
    }),
  });

  if (!res.ok) throw new Error(`Kling create failed: ${await res.text()}`);
  const data = await res.json();
  const taskId = data.data?.task_id;
  if (!taskId) throw new Error('No task ID from Kling');

  return { provider: 'kling-ai', externalTaskIds: [taskId] };
}

async function checkKlingTask(taskId: string): Promise<TaskCheckResult> {
  if (!taskId) return { done: true, error: 'No Kling task ID' };

  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) return { done: true, error: 'Kling credentials not set' };

  const token = await getKlingToken(accessKey, secretKey);
  const res = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return { done: true, error: 'Kling status check failed' };

  const data = await res.json();
  const status = data.data?.task_status;

  if (status === 'succeed') {
    const videoUrl = data.data?.task_result?.videos?.[0]?.url;
    if (videoUrl) return { done: true, videoUrls: [videoUrl] };
    return { done: true, error: 'No video URL in Kling response' };
  }
  if (status === 'failed') {
    return { done: true, error: data.data?.task_status_msg || 'Kling generation failed' };
  }

  return { done: false, progress: 50 };
}

// ════════════════════════════════════════════════════════════════
//  Shared helpers
// ════════════════════════════════════════════════════════════════

/** Edge-compatible HMAC-SHA256 JWT for Kling API */
async function getKlingToken(accessKey: string, secretKey: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${encodedHeader}.${encodedPayload}`));
  const signature = base64UrlEncodeBuffer(new Uint8Array(sig));

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function base64UrlEncode(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeBuffer(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image/webp';
  return 'image/jpeg';
}
