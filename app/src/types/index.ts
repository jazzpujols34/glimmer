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
  // Batch generation
  batchId?: string;         // Reference to parent batch
  segmentIndex?: number;    // 0-based index in batch (0 = first segment)
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
  id: string;             // Order ID (e.g., GL1234567890ABCD)
  credits: number;        // generations purchased
  amountTWD: number;
  createdAt: string;
  provider?: 'ecpay' | 'stripe' | 'admin';  // Payment provider or admin grant
  ecpayTradeNo?: string;          // ECPay transaction number
  adminGrantedBy?: string;        // Admin email who granted (for admin grants)
  adminReason?: string;           // Reason for admin grant
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

// === Storyboard System Types ===
// Storyboard = sequential slots filled with video clips for composing final videos

export type StoryboardTransitionType = 'cut' | 'crossfade-500' | 'crossfade-1000';
export type SlotFitMode = 'letterbox' | 'crop';
export type SlotStatus = 'empty' | 'uploading' | 'filled' | 'text-card';

export interface StoryboardClip {
  sourceType: 'gallery' | 'upload';
  jobId?: string;                    // if from gallery
  videoUrl: string;                  // CDN URL or R2 key
  r2Key?: string;                    // R2 storage key for uploaded videos
  duration: number;                  // full clip duration in seconds
  trimStart?: number;                // trim in-point (seconds, default 0)
  trimEnd?: number;                  // trim out-point (seconds, default duration)
  originalAspectRatio?: AspectRatio;
  fitMode: SlotFitMode;              // how to handle aspect ratio mismatch
}

export interface StoryboardSlot {
  id: string;                        // slot_xxx
  index: number;                     // 0-based position in sequence
  status: SlotStatus;
  uploadProgress?: number;           // 0-100 during upload
  clip?: StoryboardClip;             // video content (when status='filled')
  textCard?: StoryboardTitleCard;    // text card content (when status='text-card')
}

export interface StoryboardTitleCard {
  text: string;
  subtitle?: string;
  durationSeconds: number;           // default 3
  backgroundColor: string;           // hex, default #000000
  textColor: string;                 // hex, default #FFFFFF
}

export interface StoryboardMusic {
  type: 'bundled' | 'uploaded';
  src: string;                       // filename for bundled, R2 key for uploaded
  name: string;                      // display name
  volume: number;                    // 0-1, default 0.3
}

export interface StoryboardMusicTrack {
  id: string;                        // unique track id
  type: 'bundled' | 'uploaded';
  src: string;                       // filename for bundled, R2 key for uploaded
  name: string;                      // display name
  volume: number;                    // 0-1, default 0.3
  timelinePosition: number;          // seconds — where on timeline this track starts
  trimStart: number;                 // seconds — trim in-point within audio
  trimEnd: number;                   // seconds — trim out-point within audio
}

export type SubtitlePosition = 'top' | 'center' | 'bottom';

export interface StoryboardSubtitle {
  id: string;
  text: string;
  startTime: number;                 // seconds, relative to final video timeline
  endTime: number;
  position: SubtitlePosition;
}

export interface Storyboard {
  id: string;                        // storyboard_xxx
  name: string;
  aspectRatio: AspectRatio;          // target output ratio (16:9 or 9:16)
  slotCount: number;                 // e.g., 15
  slots: StoryboardSlot[];
  transitions: StoryboardTransitionType[];  // length = slotCount - 1
  createdAt: string;
  updatedAt: string;
  email?: string;                    // Owner's email
  titleCard?: StoryboardTitleCard;   // Intro card at start
  outroCard?: StoryboardTitleCard;   // Outro card at end
  music?: StoryboardMusic;           // Legacy: single background music track
  musicTracks?: StoryboardMusicTrack[];  // Multi-track background music
  subtitles?: StoryboardSubtitle[];  // Text overlays on final video
}

// === Batch Generation Types ===
// Batch = generate N-1 video segments from N photos using first-last-frame mode

export type BatchStatus = 'queued' | 'processing' | 'partial' | 'complete' | 'error';

export interface BatchJob {
  id: string;                        // batch_xxx
  status: BatchStatus;
  email: string;
  name: string;
  occasion: OccasionType;
  settings: GenerationSettings;
  segmentJobIds: string[];           // References to GenerationJob IDs
  projectId: string;                 // Auto-created project ID
  totalSegments: number;             // N-1 segments (N photos)
  completedSegments: number;         // How many segments are done
  failedSegments: number;            // How many segments failed
  createdAt: string;
  updatedAt?: string;
}

// === Quick Template Types ===
// Quick = one-click video generation with pre-configured templates

export type QuickJobStatus = 'generating' | 'exporting' | 'complete' | 'error';

export interface QuickJob {
  id: string;                        // quick_xxx
  status: QuickJobStatus;
  email: string;
  templateId: string;

  // User inputs
  name: string;
  date?: string;
  message?: string;

  // Generation tracking
  batchId: string;                   // Reference to BatchJob
  storyboardId?: string;             // Created after generation complete
  exportId?: string;                 // Cloud Run export ID

  // Results
  videoR2Key?: string;               // Final video in R2
  error?: string;

  createdAt: string;
  updatedAt?: string;
}
