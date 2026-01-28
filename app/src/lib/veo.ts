import { GoogleGenAI } from '@google/genai';
import { setJobStatus, setJobComplete, setJobError, updateJob } from './storage';
import { buildPrompt } from './prompts';
import type { GenerationSettings, OccasionType } from '@/types';

interface VeoGenerationOptions {
  jobId: string;
  photos: Buffer[];
  name: string;
  occasion: OccasionType;
  settings: GenerationSettings;
}

// Initialize Google AI client for Vertex AI (Veo 3.1)
function getVertexAIClient(): GoogleGenAI {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  if (!project) {
    throw new Error('GOOGLE_CLOUD_PROJECT_ID environment variable is not set');
  }

  return new GoogleGenAI({
    vertexai: true,
    project,
    location,
  });
}

// Initialize Google AI client for API key (Gemini fallback)
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is not set');
  }
  return new GoogleGenAI({ apiKey });
}

export async function generateVideo(options: VeoGenerationOptions): Promise<void> {
  const { jobId, photos, name, occasion, settings } = options;

  console.log(`[Video] Starting generation for job ${jobId}`, {
    photoCount: photos.length,
    model: settings.model,
    taskType: settings.taskType,
    aspectRatio: settings.aspectRatio,
    videoLength: settings.videoLength,
    resolution: settings.resolution,
    numResults: settings.numResults,
    hasPrompt: !!settings.prompt,
    seed: settings.seed,
  });

  try {
    // Build the complete prompt with system instructions
    const fullPrompt = buildPrompt({
      userPrompt: settings.prompt,
      occasion,
      taskType: settings.taskType,
      name,
    });

    console.log(`[Video] Generated prompt for job ${jobId}:\n${fullPrompt.substring(0, 500)}...`);

    // Route to appropriate model handler
    switch (settings.model) {
      case 'byteplus':
        await generateWithBytePlus(options, fullPrompt);
        break;
      case 'veo-3.1':
        await generateWithVeo31(options, fullPrompt);
        break;
      case 'veo-3.1-fast':
        await generateWithVeo31Fast(options, fullPrompt);
        break;
      case 'kling-ai':
        await generateWithKlingAI(options, fullPrompt);
        break;
      default:
        await generateWithBytePlus(options, fullPrompt);
    }
  } catch (error) {
    console.error(`[Video] Generation failed for job ${jobId}:`, error);
    setJobError(jobId, error instanceof Error ? error.message : 'Generation failed');
  }
}

/**
 * Create a single BytePlus video task and poll until completion
 * Returns the video URL on success
 */
async function createAndPollBytePlusTask(
  apiKey: string,
  modelId: string,
  imageDataUrl: string,
  fullPromptWithParams: string,
  videoIndex: number,
  totalVideos: number
): Promise<string> {
  // Create video generation task
  const createResponse = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      content: [
        {
          type: 'text',
          text: fullPromptWithParams,
        },
        {
          type: 'image_url',
          image_url: {
            url: imageDataUrl,
          },
        },
      ],
    }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error(`[BytePlus] Create task ${videoIndex + 1}/${totalVideos} failed:`, errorText);
    throw new Error(`BytePlus API error: ${createResponse.status} - ${errorText}`);
  }

  const createResult = await createResponse.json();
  console.log(`[BytePlus] Task ${videoIndex + 1}/${totalVideos} created:`, JSON.stringify(createResult, null, 2));

  const taskId = createResult.id || createResult.task_id;
  if (!taskId) {
    throw new Error('No task ID returned from BytePlus API');
  }

  console.log(`[BytePlus] Task ${videoIndex + 1}/${totalVideos} ID: ${taskId}`);

  // Poll for completion
  let pollCount = 0;
  const maxPolls = 90; // Max 15 minutes (90 * 10 seconds)

  while (pollCount < maxPolls) {
    await delay(10000); // Poll every 10 seconds
    pollCount++;

    const statusResponse = await fetch(`https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error(`[BytePlus] Status check failed for task ${videoIndex + 1}:`, errorText);
      throw new Error(`BytePlus status check failed: ${statusResponse.status}`);
    }

    const statusResult = await statusResponse.json();
    const status = statusResult.status || statusResult.task_status;

    console.log(`[BytePlus] Task ${videoIndex + 1}/${totalVideos} poll ${pollCount}/${maxPolls}, status: ${status}`);

    if (status === 'succeeded' || status === 'completed' || status === 'success') {
      const videoUrl = statusResult.output?.video_url ||
                      statusResult.content?.video_url ||
                      statusResult.video_url ||
                      statusResult.result?.video_url;

      if (videoUrl) {
        console.log(`[BytePlus] Task ${videoIndex + 1}/${totalVideos} complete: ${videoUrl}`);
        return videoUrl;
      }

      console.log(`[BytePlus] Full success response:`, JSON.stringify(statusResult, null, 2));
      throw new Error('No video URL in BytePlus response');
    } else if (status === 'failed' || status === 'error') {
      const errorMsg = statusResult.error || statusResult.message || 'BytePlus generation failed';
      console.error(`[BytePlus] Task ${videoIndex + 1} failed:`, JSON.stringify(statusResult, null, 2));
      throw new Error(errorMsg);
    }
  }

  throw new Error(`BytePlus task ${videoIndex + 1} timed out`);
}

/**
 * Generate video using BytePlus Seedance (Image-to-Video)
 * Supports generating multiple videos based on numResults setting
 */
async function generateWithBytePlus(options: VeoGenerationOptions, prompt: string): Promise<void> {
  const { jobId, photos, settings } = options;

  const apiKey = process.env.BYTEPLUS_API_KEY;
  const modelId = process.env.BYTEPLUS_MODEL_ID;

  if (!apiKey) {
    throw new Error('BYTEPLUS_API_KEY environment variable is not set');
  }
  if (!modelId) {
    throw new Error('BYTEPLUS_MODEL_ID environment variable is not set');
  }

  const numVideos = Math.min(Math.max(settings.numResults || 1, 1), 4); // Clamp to 1-4
  console.log(`[BytePlus] Processing job ${jobId}, generating ${numVideos} video(s)`);
  setJobStatus(jobId, 'processing', 5);

  try {
    // Convert image to base64 data URL
    const imageBase64 = photos[0].toString('base64');
    const mimeType = detectMimeType(photos[0]);
    const imageDataUrl = `data:${mimeType};base64,${imageBase64}`;

    console.log(`[BytePlus] Image prepared: ${mimeType}, ${Math.round(photos[0].length / 1024)}KB`);
    setJobStatus(jobId, 'processing', 10);

    // Build prompt with parameters
    // Format: "prompt text --resolution 720p --duration 5 --ratio 9:16 --camerafixed false"
    const resolution = settings.resolution || '720p';
    const duration = Math.min(Math.max(settings.videoLength, 2), 12); // Clamp to 2-12
    const aspectRatio = settings.aspectRatio || '16:9';
    const fullPromptWithParams = `${prompt} --resolution ${resolution} --duration ${duration} --ratio ${aspectRatio} --camerafixed false`;

    console.log(`[BytePlus] Prompt: ${fullPromptWithParams.substring(0, 200)}...`);

    // Generate videos sequentially (to avoid rate limiting)
    const videoUrls: string[] = [];

    for (let i = 0; i < numVideos; i++) {
      // Update progress: each video gets equal share of 10-95% range
      const baseProgress = 10 + Math.floor((i / numVideos) * 85);
      setJobStatus(jobId, 'processing', baseProgress);

      console.log(`[BytePlus] Starting video ${i + 1}/${numVideos}`);

      const videoUrl = await createAndPollBytePlusTask(
        apiKey,
        modelId,
        imageDataUrl,
        fullPromptWithParams,
        i,
        numVideos
      );

      videoUrls.push(videoUrl);
      console.log(`[BytePlus] Video ${i + 1}/${numVideos} completed`);
    }

    setJobStatus(jobId, 'processing', 98);
    setJobComplete(jobId, videoUrls[0], videoUrls);
    console.log(`[BytePlus] All ${numVideos} video(s) complete for job ${jobId}`);

  } catch (error: unknown) {
    console.error(`[BytePlus] API error for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Generate video using Veo 3.1 (high quality)
 */
async function generateWithVeo31(options: VeoGenerationOptions, prompt: string): Promise<void> {
  const { jobId, photos, settings } = options;

  console.log(`[Veo 3.1] Processing job ${jobId}`);
  setJobStatus(jobId, 'processing', 10);

  try {
    const ai = getVertexAIClient();

    // Convert first photo to base64
    const imageBase64 = photos[0].toString('base64');
    const mimeType = detectMimeType(photos[0]);

    console.log(`[Veo 3.1] Image prepared: ${mimeType}, ${Math.round(photos[0].length / 1024)}KB`);
    setJobStatus(jobId, 'processing', 20);

    // Use Veo 3.1 model
    const modelName = 'veo-3.1-generate-001';
    console.log(`[Veo 3.1] Using model: ${modelName}`);

    setJobStatus(jobId, 'processing', 30);

    // Generate video using Veo 3.1 (fixed 8 second duration)
    const veoDuration = 8; // Veo 3.1 only supports 8 seconds
    console.log(`[Veo 3.1] Calling generateVideos with config:`, {
      model: modelName,
      aspectRatio: settings.aspectRatio,
      numberOfVideos: settings.numResults,
      durationSeconds: veoDuration,
      imageSize: `${Math.round(photos[0].length / 1024)}KB`,
      mimeType: mimeType,
    });

    let operation = await ai.models.generateVideos({
      model: modelName,
      prompt: prompt,
      image: {
        imageBytes: imageBase64,
        mimeType: mimeType,
      },
      config: {
        aspectRatio: settings.aspectRatio,
        numberOfVideos: settings.numResults,
        durationSeconds: veoDuration,
        personGeneration: 'allow_adult',
        generateAudio: true,
        ...(settings.seed !== undefined && { seed: settings.seed }),
      },
    });

    console.log(`[Veo 3.1] Generation request submitted for job ${jobId}, operation: ${operation.name}`);
    setJobStatus(jobId, 'processing', 40);

    // Poll for completion
    let pollCount = 0;
    const maxPolls = 120; // Max 20 minutes (120 * 10 seconds)

    while (!operation.done && pollCount < maxPolls) {
      await delay(10000); // Poll every 10 seconds
      pollCount++;

      // Update progress (40-95%)
      const progress = Math.min(40 + Math.floor((pollCount / maxPolls) * 55), 95);
      setJobStatus(jobId, 'processing', progress);

      // Check operation status
      operation = await ai.operations.getVideosOperation({
        operation: operation,
      });

      console.log(`[Veo 3.1] Poll ${pollCount}/${maxPolls} for job ${jobId}, done: ${operation.done}`);
    }

    if (!operation.done) {
      throw new Error('Video generation timed out');
    }

    setJobStatus(jobId, 'processing', 98);

    // Log full response for debugging
    console.log(`[Veo 3.1] Operation response for job ${jobId}:`, JSON.stringify(operation, null, 2));

    // Check for RAI (Responsible AI) filtering
    const response = operation.response;
    if (response?.raiMediaFilteredCount && response.raiMediaFilteredCount > 0) {
      const reasons = response.raiMediaFilteredReasons?.join(', ') || 'Unknown policy violation';
      console.error(`[Veo 3.1] Content filtered by RAI policy: ${reasons}`);
      throw new Error(`內容被安全政策過濾: ${reasons}`);
    }

    // Get the generated video
    if (response?.generatedVideos && response.generatedVideos.length > 0) {
      const video = response.generatedVideos[0];

      if (video.video?.uri) {
        console.log(`[Veo 3.1] Video generated at URI: ${video.video.uri}`);
        setJobComplete(jobId, video.video.uri);
      } else if (video.video?.videoBytes) {
        const videoUrl = `data:video/mp4;base64,${video.video.videoBytes}`;
        setJobComplete(jobId, videoUrl);
      } else {
        console.error(`[Veo 3.1] Video object has no uri or videoBytes:`, JSON.stringify(video, null, 2));
        throw new Error('No video data in response');
      }

      console.log(`[Veo 3.1] Generation complete for job ${jobId}`);
    } else {
      // Check if there's an error in the response
      if (operation.error) {
        console.error(`[Veo 3.1] API returned error:`, JSON.stringify(operation.error, null, 2));
        throw new Error(`Veo API error: ${JSON.stringify(operation.error)}`);
      }
      console.error(`[Veo 3.1] No videos in response. Full operation:`, JSON.stringify(operation, null, 2));
      throw new Error('No videos generated - check terminal logs for details');
    }

  } catch (error: unknown) {
    console.error(`[Veo 3.1] API error for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Generate video using Veo 3.1 Fast (faster generation)
 */
async function generateWithVeo31Fast(options: VeoGenerationOptions, prompt: string): Promise<void> {
  const { jobId, photos, settings } = options;

  console.log(`[Veo 3.1 Fast] Processing job ${jobId}`);
  setJobStatus(jobId, 'processing', 10);

  try {
    const ai = getVertexAIClient();

    const imageBase64 = photos[0].toString('base64');
    const mimeType = detectMimeType(photos[0]);

    console.log(`[Veo 3.1 Fast] Image prepared: ${mimeType}, ${Math.round(photos[0].length / 1024)}KB`);
    setJobStatus(jobId, 'processing', 25);

    // Use Veo 3.1 Fast model
    const modelName = 'veo-3.1-fast-generate-001';
    console.log(`[Veo 3.1 Fast] Using model: ${modelName}`);

    setJobStatus(jobId, 'processing', 35);

    // Veo 3.1 Fast also uses fixed 8 second duration
    const veoDuration = 8;
    console.log(`[Veo 3.1 Fast] Calling generateVideos with config:`, {
      model: modelName,
      aspectRatio: settings.aspectRatio,
      numberOfVideos: settings.numResults,
      durationSeconds: veoDuration,
      imageSize: `${Math.round(photos[0].length / 1024)}KB`,
      mimeType: mimeType,
    });

    let operation = await ai.models.generateVideos({
      model: modelName,
      prompt: prompt,
      image: {
        imageBytes: imageBase64,
        mimeType: mimeType,
      },
      config: {
        aspectRatio: settings.aspectRatio,
        numberOfVideos: settings.numResults,
        durationSeconds: veoDuration,
        personGeneration: 'allow_adult',
        generateAudio: true,
        ...(settings.seed !== undefined && { seed: settings.seed }),
      },
    });

    console.log(`[Veo 3.1 Fast] Generation request submitted for job ${jobId}`);
    setJobStatus(jobId, 'processing', 50);

    // Poll for completion (faster model, shorter timeout)
    let pollCount = 0;
    const maxPolls = 60; // Max 10 minutes

    while (!operation.done && pollCount < maxPolls) {
      await delay(10000);
      pollCount++;

      const progress = Math.min(50 + Math.floor((pollCount / maxPolls) * 45), 95);
      setJobStatus(jobId, 'processing', progress);

      operation = await ai.operations.getVideosOperation({
        operation: operation,
      });

      console.log(`[Veo 3.1 Fast] Poll ${pollCount}/${maxPolls} for job ${jobId}, done: ${operation.done}`);
    }

    if (!operation.done) {
      throw new Error('Video generation timed out');
    }

    setJobStatus(jobId, 'processing', 98);

    // Log full response for debugging
    console.log(`[Veo 3.1 Fast] Operation response for job ${jobId}:`, JSON.stringify(operation, null, 2));

    // Check for RAI (Responsible AI) filtering
    const response = operation.response;
    if (response?.raiMediaFilteredCount && response.raiMediaFilteredCount > 0) {
      const reasons = response.raiMediaFilteredReasons?.join(', ') || 'Unknown policy violation';
      console.error(`[Veo 3.1 Fast] Content filtered by RAI policy: ${reasons}`);
      throw new Error(`內容被安全政策過濾: ${reasons}`);
    }

    if (response?.generatedVideos && response.generatedVideos.length > 0) {
      const video = response.generatedVideos[0];

      if (video.video?.uri) {
        console.log(`[Veo 3.1 Fast] Video generated at URI: ${video.video.uri}`);
        setJobComplete(jobId, video.video.uri);
      } else if (video.video?.videoBytes) {
        const videoUrl = `data:video/mp4;base64,${video.video.videoBytes}`;
        setJobComplete(jobId, videoUrl);
      } else {
        console.error(`[Veo 3.1 Fast] Video object has no uri or videoBytes:`, JSON.stringify(video, null, 2));
        throw new Error('No video data in response');
      }

      console.log(`[Veo 3.1 Fast] Generation complete for job ${jobId}`);
    } else {
      // Check if there's an error in the response
      if (operation.error) {
        console.error(`[Veo 3.1 Fast] API returned error:`, JSON.stringify(operation.error, null, 2));
        throw new Error(`Veo API error: ${JSON.stringify(operation.error)}`);
      }
      console.error(`[Veo 3.1 Fast] No videos in response. Full operation:`, JSON.stringify(operation, null, 2));
      throw new Error('No videos generated - check terminal logs for details');
    }

  } catch (error: unknown) {
    console.error(`[Veo 3.1 Fast] API error for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Generate video using Kling AI
 */
async function generateWithKlingAI(options: VeoGenerationOptions, prompt: string): Promise<void> {
  const { jobId, photos, settings } = options;

  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error('Kling AI API credentials not configured');
  }

  console.log(`[Kling AI] Processing job ${jobId}`);
  setJobStatus(jobId, 'processing', 10);

  try {
    const imageBase64 = photos[0].toString('base64');

    console.log(`[Kling AI] Image prepared, ${Math.round(photos[0].length / 1024)}KB`);
    setJobStatus(jobId, 'processing', 20);

    // Get JWT token from Kling API
    const token = await getKlingToken(accessKey, secretKey);

    setJobStatus(jobId, 'processing', 30);

    // Kling AI duration: must be exactly 5 or 10 seconds
    const klingDuration = settings.videoLength <= 5 ? '5' : '10';

    // Create image-to-video task
    const createResponse = await fetch('https://api.klingai.com/v1/videos/image2video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model_name: 'kling-v1-5', // or 'kling-v1' for standard
        image: imageBase64,
        prompt: prompt,
        negative_prompt: 'blurry, distorted, unnatural movements, dramatic changes, morphing',
        cfg_scale: 0.5, // Lower for more subtle results
        mode: 'std', // 'std' or 'pro'
        duration: klingDuration,
        aspect_ratio: settings.aspectRatio,
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Kling API error: ${error}`);
    }

    const createResult = await createResponse.json();
    const taskId = createResult.data?.task_id;

    if (!taskId) {
      throw new Error('No task ID returned from Kling API');
    }

    console.log(`[Kling AI] Task created: ${taskId}`);
    setJobStatus(jobId, 'processing', 40);

    // Poll for completion
    let pollCount = 0;
    const maxPolls = 60; // Max 10 minutes

    while (pollCount < maxPolls) {
      await delay(10000);
      pollCount++;

      const progress = Math.min(40 + Math.floor((pollCount / maxPolls) * 55), 95);
      setJobStatus(jobId, 'processing', progress);

      const statusResponse = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!statusResponse.ok) {
        throw new Error('Failed to check Kling task status');
      }

      const statusResult = await statusResponse.json();
      const status = statusResult.data?.task_status;

      console.log(`[Kling AI] Poll ${pollCount}/${maxPolls}, status: ${status}`);

      if (status === 'succeed') {
        const videoUrl = statusResult.data?.task_result?.videos?.[0]?.url;
        if (videoUrl) {
          setJobStatus(jobId, 'processing', 98);
          setJobComplete(jobId, videoUrl);
          console.log(`[Kling AI] Generation complete for job ${jobId}`);
          return;
        }
        throw new Error('No video URL in Kling response');
      } else if (status === 'failed') {
        throw new Error(statusResult.data?.task_status_msg || 'Kling generation failed');
      }
    }

    throw new Error('Kling video generation timed out');

  } catch (error: unknown) {
    console.error(`[Kling AI] API error for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Get Kling AI JWT token
 */
async function getKlingToken(accessKey: string, secretKey: string): Promise<string> {
  // Kling uses JWT for authentication
  // Create JWT with header and payload
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey,
    exp: now + 1800, // 30 minutes
    nbf: now - 5,
  };

  // Encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  // Create signature using HMAC-SHA256
  const crypto = await import('crypto');
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Detect MIME type from buffer
 */
function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
