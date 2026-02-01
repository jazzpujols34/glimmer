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
  email?: string;           // Email of the user who created this job
  archived?: boolean;       // true if videos have been archived to R2
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

// === Credit System Types ===

export interface CreditBalance {
  email: string;
  total: number;        // total credits ever purchased
  used: number;         // credits consumed
  freeUsed: boolean;    // whether the 1 free video has been used
  remaining: number;    // computed: (total - used) + (freeUsed ? 0 : 1)
  verified: boolean;    // whether email ownership has been verified
}

export interface CreditRecord {
  total: number;
  used: number;
  freeUsed: boolean;
  purchases: PurchaseRecord[];
}

export interface PurchaseRecord {
  id: string;           // Stripe checkout session ID
  credits: number;
  amountTWD: number;
  createdAt: string;
}

export interface FreeRecord {
  used: boolean;
  jobId?: string;
  usedAt?: string;
}

export interface CreditPack {
  id: string;           // 'single' | 'pack5'
  credits: number;
  priceTWD: number;
  perVideoPriceTWD: number;
  label: string;        // "1 支影片"
  labelEn: string;      // "1 Video"
}
