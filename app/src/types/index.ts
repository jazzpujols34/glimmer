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
  // Project organization
  projectId?: string;       // Reference to parent project
  favorite?: boolean;       // Mark as favorite (keep when bulk deleting)
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
// "Generation" = one AI video clip (5-12 sec)
// "Video" = final edited product (90-180 sec, made from multiple generations)

export const FREE_GENERATIONS = 10; // Free tier gets 10 generations

export interface CreditBalance {
  email: string;
  paidTotal: number;      // total generations ever purchased
  paidUsed: number;       // paid generations consumed
  freeUsed: number;       // free generations used (0-10)
  freeTotal: number;      // free generations available (10)
  remaining: number;      // computed: (paidTotal - paidUsed) + (freeTotal - freeUsed)
  verified: boolean;      // whether email ownership has been verified
  isAdmin?: boolean;      // admin users have unlimited generations
}

export interface CreditRecord {
  total: number;          // total paid generations purchased
  used: number;           // paid generations consumed
  purchases: PurchaseRecord[];
}

export interface PurchaseRecord {
  id: string;             // Stripe/ECPay transaction ID
  credits: number;        // generations purchased
  amountTWD: number;
  createdAt: string;
}

export interface FreeRecord {
  used: number;           // number of free generations used (max 10)
  jobs?: string[];        // job IDs created with free generations
}

export interface GenerationPack {
  id: string;             // 'pack20' | 'pack50' | 'pack100'
  generations: number;
  priceTWD: number;
  perGenPriceTWD: number;
  label: string;          // "20 次生成"
  labelEn: string;        // "20 Generations"
  savings?: string;       // "省 20%"
}

// === Project System Types ===
// Projects group multiple generation jobs together (e.g., clips for one final video)

export interface Project {
  id: string;              // project_xxx
  name: string;            // User-defined name (e.g., "媽媽追思影片")
  description?: string;
  createdAt: string;
  updatedAt: string;
  jobIds: string[];        // References to GenerationJob IDs
  coverJobId?: string;     // Job to use as thumbnail
  email?: string;          // Owner's email
}
