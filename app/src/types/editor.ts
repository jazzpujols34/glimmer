import type { OccasionType } from './index';

// === Filter Presets ===

export type FilterPreset = 'warm' | 'vintage' | 'bw' | 'vivid';

// === Transition Types ===

export type TransitionType = 'none' | 'fade' | 'crossfade';

export interface Transition {
  type: TransitionType;
  durationMs: number; // 300-1000, default 500
}

// === Timeline Clip ===

export interface TimelineClip {
  id: string;
  sourceUrl: string;       // original CDN URL
  blobUrl: string;         // local object URL after fetch
  originalDuration: number; // seconds, from video metadata
  trimStart: number;       // seconds, in-point
  trimEnd: number;         // seconds, out-point
  speed: number;           // 0.5-2.0, default 1.0
  filter: FilterPreset | null;
  volume: number;          // 0-1, original audio volume
  timelinePosition: number; // seconds, where this clip sits on the timeline
}

// Effective duration = (trimEnd - trimStart) / speed

// === Subtitle Types ===

export type SubtitlePosition = 'top' | 'center' | 'bottom';

export interface SubtitleSegment {
  id: string;
  text: string;
  startTime: number; // seconds, relative to timeline
  endTime: number;
  position: SubtitlePosition;
  // Free positioning (0-1 normalized). When set, overrides position preset.
  x?: number; // 0 = left, 0.5 = center, 1 = right
  y?: number; // 0 = top, 0.5 = center, 1 = bottom
}

// === Track State ===

export type TrackId = 'video' | 'subtitle' | 'music' | 'sfx';

export interface TrackState {
  muted: boolean;
  locked: boolean;
  visible: boolean;
}

export type TrackStates = Record<TrackId, TrackState>;

// === SFX Types ===

export interface SfxItem {
  id: string;
  name: string;
  blobUrl: string;
  startTime: number;      // timeline position in seconds
  duration: number;        // seconds
  volume: number;          // 0-1
}

// === Music Types ===

export interface MusicTrack {
  id: string;
  name: string;
  type: 'bundled' | 'uploaded';
  src: string;             // URL or filename
  blobUrl: string;         // object URL for playback
  durationSeconds: number;
  volume: number;          // 0-1
}

export interface MusicClip {
  id: string;
  name: string;
  type: 'bundled' | 'uploaded';
  src: string;
  blobUrl: string;
  originalDuration: number;  // full source audio length in seconds
  trimStart: number;         // in-point in source audio (seconds)
  trimEnd: number;           // out-point in source audio (seconds)
  timelinePosition: number;  // where on timeline (seconds)
  volume: number;            // 0-1
}
// Effective duration = trimEnd - trimStart (no speed for audio)

export interface BundledTrack {
  id: string;
  name: string;
  filename: string;        // path in /public/audio/bundled/
  occasion: OccasionType | 'all';
  durationSeconds: number;
}

// === Title Card Types ===

export interface TitleCard {
  id: string;
  type: 'intro' | 'outro';
  text: string;
  subtitle?: string;
  durationSeconds: number;    // default 3
  backgroundColor: string;    // hex
  textColor: string;          // hex
}

// === Editor State ===

export type EditorPanel = 'clips' | 'subtitles' | 'music' | 'sfx' | 'titles' | 'export';

export interface EditorState {
  jobId: string;
  jobName: string;
  email?: string;                 // For watermark decision in exports
  clips: TimelineClip[];
  transitions: Transition[];      // transitions[i] between clips[i] and clips[i+1]
  subtitles: SubtitleSegment[];
  musicClips: MusicClip[];
  selectedMusicClipId: string | null;
  sfx: SfxItem[];
  titleCard: TitleCard | null;
  outroCard: TitleCard | null;
  trackStates: TrackStates;

  // UI state
  playheadPosition: number;       // seconds
  isPlaying: boolean;
  selectedClipIds: string[];
  selectedSubtitleId: string | null;
  activePanel: EditorPanel;
  exportProgress: number | null;  // null = not exporting, 0-100
  totalDuration: number;          // computed, cached
}

// === Editor Actions ===

export type EditorAction =
  | { type: 'INIT'; payload: { jobId: string; jobName: string; clips: TimelineClip[]; email?: string } }
  | { type: 'RESTORE'; payload: EditorState }
  | { type: 'REORDER_CLIPS'; payload: { fromIndex: number; toIndex: number } }
  | { type: 'REMOVE_CLIP'; payload: { clipId: string } }
  | { type: 'SET_TRIM'; payload: { clipId: string; trimStart: number; trimEnd: number } }
  | { type: 'SET_SPEED'; payload: { clipId: string; speed: number } }
  | { type: 'SET_FILTER'; payload: { clipId: string; filter: FilterPreset | null } }
  | { type: 'SET_CLIP_VOLUME'; payload: { clipId: string; volume: number } }
  | { type: 'SET_TRANSITION'; payload: { index: number; transition: Transition } }
  | { type: 'ADD_SUBTITLE'; payload: SubtitleSegment }
  | { type: 'UPDATE_SUBTITLE'; payload: { id: string; updates: Partial<SubtitleSegment> } }
  | { type: 'REMOVE_SUBTITLE'; payload: { id: string } }
  | { type: 'SET_SUBTITLES'; payload: SubtitleSegment[] }
  // Music clips
  | { type: 'ADD_MUSIC_CLIP'; payload: MusicClip }
  | { type: 'REMOVE_MUSIC_CLIP'; payload: { id: string } }
  | { type: 'UPDATE_MUSIC_CLIP'; payload: { id: string; updates: Partial<MusicClip> } }
  | { type: 'SET_MUSIC_CLIP_POSITION'; payload: { id: string; timelinePosition: number } }
  | { type: 'SET_MUSIC_CLIP_TRIM'; payload: { id: string; trimStart: number; trimEnd: number; timelinePosition?: number } }
  | { type: 'SPLIT_MUSIC_CLIP'; payload: { playheadPosition: number } }
  | { type: 'SELECT_MUSIC_CLIP'; payload: string | null }
  | { type: 'SET_TITLE_CARD'; payload: TitleCard | null }
  | { type: 'SET_OUTRO_CARD'; payload: TitleCard | null }
  | { type: 'SET_PLAYHEAD'; payload: number }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SELECT_CLIP'; payload: { clipId: string | null; shiftKey?: boolean; metaKey?: boolean } }
  | { type: 'SELECT_ALL_CLIPS' }
  | { type: 'DESELECT_ALL' }
  | { type: 'REMOVE_SELECTED_CLIPS' }
  | { type: 'SELECT_SUBTITLE'; payload: string | null }
  | { type: 'SET_ACTIVE_PANEL'; payload: EditorPanel }
  | { type: 'SET_EXPORT_PROGRESS'; payload: number | null }
  | { type: 'ADD_CLIPS'; payload: TimelineClip[] }
  | { type: 'SPLIT_CLIP'; payload: { playheadPosition: number } }
  | { type: 'SET_CLIP_POSITION'; payload: { clipId: string; timelinePosition: number } }
  | { type: 'SET_CLIPS_POSITIONS'; payload: { positions: Array<{ clipId: string; timelinePosition: number }> } }
  // Track state
  | { type: 'SET_TRACK_STATE'; payload: { trackId: TrackId; updates: Partial<TrackState> } }
  // SFX
  | { type: 'ADD_SFX'; payload: SfxItem }
  | { type: 'REMOVE_SFX'; payload: { id: string } }
  | { type: 'UPDATE_SFX'; payload: { id: string; updates: Partial<SfxItem> } }
  // Snap & Ripple
  | { type: 'SNAP_CLIPS_LEFT' }
  | { type: 'SNAP_CLIPS_RIGHT' }
  | { type: 'RIPPLE_DELETE' }
  // Undo/Redo
  | { type: 'UNDO' }
  | { type: 'REDO' };
