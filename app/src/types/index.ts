export type OccasionType = 'memorial' | 'birthday' | 'wedding' | 'pet' | 'other';

export type GenerationStatus = 'queued' | 'processing' | 'complete' | 'error';

// Task types
export type TaskType = 'image-to-video' | 'first-last-frame';

// Model options
export type ModelType = 'veo-3.1' | 'veo-3.1-fast' | 'kling-ai' | 'byteplus';

// Aspect ratio options (Veo & Kling both support 16:9 and 9:16)
export type AspectRatio = '16:9' | '9:16';

// Resolution options
export type Resolution = '720p' | '1080p';

// Video duration options for Kling AI (Veo is fixed at 8s)
export type KlingDuration = 5 | 10;

// Generation settings
export interface GenerationSettings {
  taskType: TaskType;
  model: ModelType;
  prompt: string;
  aspectRatio: AspectRatio;
  numResults: number;      // 1-4
  videoLength: number;     // Veo: fixed 8s, Kling: 5 or 10
  resolution: Resolution;
  cameraFixed: boolean;    // true = fixed camera, false = dynamic
  seed?: number;           // optional, user input only
}

// Default settings (BytePlus defaults)
export const defaultSettings: GenerationSettings = {
  taskType: 'image-to-video',
  model: 'byteplus',
  prompt: '',
  aspectRatio: '16:9',
  numResults: 1,
  videoLength: 5,          // BytePlus: 2-12s
  resolution: '720p',
  cameraFixed: false,      // dynamic camera by default
  seed: undefined,
};

export interface GenerationRequest {
  name: string;
  occasion: OccasionType;
  settings: GenerationSettings;
  photos: File[];
}

export interface GenerationJob {
  id: string;
  status: GenerationStatus;
  progress?: number;
  videoUrl?: string;        // Primary video URL (first video)
  videoUrls?: string[];     // All video URLs when numResults > 1
  error?: string;
  createdAt: string;
  // Metadata for gallery/VOD
  name?: string;
  occasion?: OccasionType;
  settings?: GenerationSettings;
  // Edge-compatible: external task tracking (serverless polling)
  provider?: ModelType;
  externalTaskIds?: string[];       // BytePlus/Kling task IDs
  veoOperationName?: string;        // Veo operation resource name
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
