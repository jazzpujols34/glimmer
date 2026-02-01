'use client';

import { createContext, useContext, useReducer, useEffect, useRef, type ReactNode, type Dispatch } from 'react';
import { saveEditorState } from '@/lib/editor/auto-save';
import type { EditorState, EditorAction, TimelineClip, MusicClip, Transition, TrackStates } from '@/types/editor';
import {
  getTotalDuration,
  getClipDuration,
  getMusicClipDuration,
  generateId,
  clipsSortedByPosition,
  getSnapLeftDelta,
  getSnapRightDelta,
  rippleDeleteClips,
} from '@/lib/editor/timeline-utils';

// --- Default track states ---

const DEFAULT_TRACK_STATES: TrackStates = {
  video: { muted: false, locked: false, visible: true },
  subtitle: { muted: false, locked: false, visible: true },
  music: { muted: false, locked: false, visible: true },
  sfx: { muted: false, locked: false, visible: true },
};

// --- Initial state ---

function createInitialState(): EditorState {
  return {
    jobId: '',
    jobName: '',
    clips: [],
    transitions: [],
    subtitles: [],
    musicClips: [],
    sfx: [],
    titleCard: null,
    outroCard: null,
    trackStates: { ...DEFAULT_TRACK_STATES },
    playheadPosition: 0,
    isPlaying: false,
    selectedClipIds: [],
    selectedMusicClipId: null,
    selectedSubtitleId: null,
    activePanel: 'clips',
    exportProgress: null,
    totalDuration: 0,
  };
}

// --- Helpers ---

function buildDefaultTransitions(clipCount: number): Transition[] {
  const transitions: Transition[] = [];
  for (let i = 0; i < clipCount - 1; i++) {
    transitions.push({ type: 'none', durationMs: 500 });
  }
  return transitions;
}

function updateClip(clips: TimelineClip[], clipId: string, updates: Partial<TimelineClip>): TimelineClip[] {
  return clips.map(c => c.id === clipId ? { ...c, ...updates } : c);
}

/** Assign sequential timelinePositions starting from `startPos` */
function positionClipsSequentially(clips: TimelineClip[], startPos: number): TimelineClip[] {
  let pos = startPos;
  return clips.map(clip => {
    const positioned = { ...clip, timelinePosition: pos };
    pos += getClipDuration(clip);
    return positioned;
  });
}

/** Get the end of the rightmost clip (or 0) */
function getClipsMaxEnd(clips: TimelineClip[]): number {
  let maxEnd = 0;
  for (const clip of clips) {
    maxEnd = Math.max(maxEnd, clip.timelinePosition + getClipDuration(clip));
  }
  return maxEnd;
}

// --- Reducer ---

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  let next: EditorState;

  switch (action.type) {
    case 'INIT': {
      const { jobId, jobName, clips } = action.payload;
      // Position clips sequentially starting at 0
      const positioned = positionClipsSequentially(clips, 0);
      next = {
        ...createInitialState(),
        jobId,
        jobName,
        clips: positioned,
        transitions: buildDefaultTransitions(positioned.length),
      };
      break;
    }

    case 'RESTORE': {
      // Restore full state from auto-save (blobUrls already re-created by caller)
      next = { ...action.payload };
      break;
    }

    case 'REORDER_CLIPS': {
      // With free positioning, reorder swaps timelinePositions
      const { fromIndex, toIndex } = action.payload;
      const clips = [...state.clips];
      const fromPos = clips[fromIndex].timelinePosition;
      const toPos = clips[toIndex].timelinePosition;
      clips[fromIndex] = { ...clips[fromIndex], timelinePosition: toPos };
      clips[toIndex] = { ...clips[toIndex], timelinePosition: fromPos };
      next = {
        ...state,
        clips: clipsSortedByPosition(clips),
        transitions: buildDefaultTransitions(clips.length),
      };
      break;
    }

    case 'REMOVE_CLIP': {
      const clips = state.clips.filter(c => c.id !== action.payload.clipId);
      next = {
        ...state,
        clips,
        transitions: buildDefaultTransitions(clips.length),
        selectedClipIds: state.selectedClipIds.filter(id => id !== action.payload.clipId),
      };
      break;
    }

    case 'SET_TRIM':
      next = {
        ...state,
        clips: updateClip(state.clips, action.payload.clipId, {
          trimStart: action.payload.trimStart,
          trimEnd: action.payload.trimEnd,
        }),
      };
      break;

    case 'SET_SPEED':
      next = {
        ...state,
        clips: updateClip(state.clips, action.payload.clipId, { speed: action.payload.speed }),
      };
      break;

    case 'SET_FILTER':
      next = {
        ...state,
        clips: updateClip(state.clips, action.payload.clipId, { filter: action.payload.filter }),
      };
      break;

    case 'SET_CLIP_VOLUME':
      next = {
        ...state,
        clips: updateClip(state.clips, action.payload.clipId, { volume: action.payload.volume }),
      };
      break;

    case 'SET_TRANSITION': {
      const transitions = [...state.transitions];
      transitions[action.payload.index] = action.payload.transition;
      next = { ...state, transitions };
      break;
    }

    case 'ADD_SUBTITLE':
      next = { ...state, subtitles: [...state.subtitles, action.payload] };
      break;

    case 'UPDATE_SUBTITLE':
      next = {
        ...state,
        subtitles: state.subtitles.map(s =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
      };
      break;

    case 'REMOVE_SUBTITLE':
      next = {
        ...state,
        subtitles: state.subtitles.filter(s => s.id !== action.payload.id),
        selectedSubtitleId: state.selectedSubtitleId === action.payload.id ? null : state.selectedSubtitleId,
      };
      break;

    case 'SET_SUBTITLES':
      next = { ...state, subtitles: action.payload };
      break;

    case 'SET_TITLE_CARD':
      next = { ...state, titleCard: action.payload };
      break;

    case 'SET_OUTRO_CARD':
      next = { ...state, outroCard: action.payload };
      break;

    case 'SET_PLAYHEAD':
      next = { ...state, playheadPosition: action.payload };
      break;

    case 'SET_PLAYING':
      next = { ...state, isPlaying: action.payload };
      break;

    // --- Multi-select ---

    case 'SELECT_CLIP': {
      const { clipId, shiftKey, metaKey } = action.payload;

      if (clipId === null) {
        next = { ...state, selectedClipIds: [] };
        break;
      }

      if (metaKey) {
        // Toggle: add or remove from selection
        const exists = state.selectedClipIds.includes(clipId);
        next = {
          ...state,
          selectedClipIds: exists
            ? state.selectedClipIds.filter(id => id !== clipId)
            : [...state.selectedClipIds, clipId],
          selectedMusicClipId: null,
          activePanel: 'clips',
        };
      } else if (shiftKey) {
        // Range select by position order
        const sorted = clipsSortedByPosition(state.clips);
        const sortedIds = sorted.map(c => c.id);
        const clickedIndex = sortedIds.indexOf(clipId);

        const lastSelectedId = state.selectedClipIds[state.selectedClipIds.length - 1];
        const lastIndex = lastSelectedId ? sortedIds.indexOf(lastSelectedId) : clickedIndex;

        const from = Math.min(lastIndex, clickedIndex);
        const to = Math.max(lastIndex, clickedIndex);
        const rangeIds = sortedIds.slice(from, to + 1);

        const merged = Array.from(new Set([...state.selectedClipIds, ...rangeIds]));
        next = {
          ...state,
          selectedClipIds: merged,
          selectedMusicClipId: null,
          activePanel: 'clips',
        };
      } else {
        // Normal click: select only this clip
        next = {
          ...state,
          selectedClipIds: [clipId],
          selectedMusicClipId: null,
          activePanel: 'clips',
        };
      }
      break;
    }

    case 'SELECT_ALL_CLIPS':
      next = { ...state, selectedClipIds: state.clips.map(c => c.id) };
      break;

    case 'DESELECT_ALL':
      next = { ...state, selectedClipIds: [], selectedMusicClipId: null, selectedSubtitleId: null };
      break;

    case 'REMOVE_SELECTED_CLIPS': {
      const idsToRemove = new Set(state.selectedClipIds);
      const clips = state.clips.filter(c => !idsToRemove.has(c.id));
      next = {
        ...state,
        clips,
        transitions: buildDefaultTransitions(clips.length),
        selectedClipIds: [],
      };
      break;
    }

    case 'SELECT_SUBTITLE':
      next = {
        ...state,
        selectedSubtitleId: action.payload,
        activePanel: action.payload ? 'subtitles' : state.activePanel,
      };
      break;

    case 'SET_ACTIVE_PANEL':
      next = { ...state, activePanel: action.payload };
      break;

    case 'SET_EXPORT_PROGRESS':
      next = { ...state, exportProgress: action.payload };
      break;

    case 'ADD_CLIPS': {
      // Place new clips after existing content
      const maxEnd = Math.max(
        getClipsMaxEnd(state.clips),
        state.titleCard ? state.titleCard.durationSeconds : 0,
      );
      const positioned = positionClipsSequentially(action.payload, maxEnd);
      const newClips = [...state.clips, ...positioned];
      next = {
        ...state,
        clips: clipsSortedByPosition(newClips),
        transitions: buildDefaultTransitions(newClips.length),
      };
      break;
    }

    case 'SPLIT_CLIP': {
      const { playheadPosition } = action.payload;

      // Find which clip the playhead is on
      let splitIndex = -1;
      let splitSourceTime = 0;

      for (let i = 0; i < state.clips.length; i++) {
        const clip = state.clips[i];
        const clipStart = clip.timelinePosition;
        const clipDuration = getClipDuration(clip);

        if (playheadPosition >= clipStart && playheadPosition < clipStart + clipDuration) {
          splitIndex = i;
          const elapsed = playheadPosition - clipStart;
          splitSourceTime = clip.trimStart + elapsed * clip.speed;
          break;
        }
      }

      if (splitIndex === -1) {
        next = state;
        break;
      }

      const original = state.clips[splitIndex];

      // Don't split if too close to edges (< 0.1s from either end)
      if (splitSourceTime <= original.trimStart + 0.1 || splitSourceTime >= original.trimEnd - 0.1) {
        next = state;
        break;
      }

      const clipA: TimelineClip = {
        ...original,
        id: generateId(),
        trimEnd: splitSourceTime,
        timelinePosition: original.timelinePosition,
      };

      const clipADuration = getClipDuration(clipA);

      const clipB: TimelineClip = {
        ...original,
        id: generateId(),
        trimStart: splitSourceTime,
        timelinePosition: original.timelinePosition + clipADuration,
      };

      const splitClips = [...state.clips];
      splitClips.splice(splitIndex, 1, clipA, clipB);

      next = {
        ...state,
        clips: clipsSortedByPosition(splitClips),
        transitions: buildDefaultTransitions(splitClips.length),
        selectedClipIds: [clipA.id],
      };
      break;
    }

    case 'SET_CLIP_POSITION': {
      const { clipId, timelinePosition } = action.payload;
      const updated = state.clips.map(c =>
        c.id === clipId ? { ...c, timelinePosition: Math.max(0, timelinePosition) } : c
      );
      next = {
        ...state,
        clips: clipsSortedByPosition(updated),
      };
      break;
    }

    case 'SET_CLIPS_POSITIONS': {
      const posMap = new Map(action.payload.positions.map(p => [p.clipId, p.timelinePosition]));
      const updated = state.clips.map(c => {
        const newPos = posMap.get(c.id);
        return newPos !== undefined ? { ...c, timelinePosition: Math.max(0, newPos) } : c;
      });
      next = { ...state, clips: clipsSortedByPosition(updated) };
      break;
    }

    // --- Track state ---

    case 'SET_TRACK_STATE': {
      const { trackId, updates } = action.payload;
      next = {
        ...state,
        trackStates: {
          ...state.trackStates,
          [trackId]: { ...state.trackStates[trackId], ...updates },
        },
      };
      break;
    }

    // --- SFX ---

    case 'ADD_SFX':
      next = { ...state, sfx: [...state.sfx, action.payload] };
      break;

    case 'REMOVE_SFX':
      next = { ...state, sfx: state.sfx.filter(s => s.id !== action.payload.id) };
      break;

    case 'UPDATE_SFX':
      next = {
        ...state,
        sfx: state.sfx.map(s =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
      };
      break;

    // --- Music Clips ---

    case 'ADD_MUSIC_CLIP':
      next = { ...state, musicClips: [...state.musicClips, action.payload] };
      break;

    case 'REMOVE_MUSIC_CLIP':
      next = {
        ...state,
        musicClips: state.musicClips.filter(mc => mc.id !== action.payload.id),
        selectedMusicClipId: state.selectedMusicClipId === action.payload.id ? null : state.selectedMusicClipId,
      };
      break;

    case 'UPDATE_MUSIC_CLIP':
      next = {
        ...state,
        musicClips: state.musicClips.map(mc =>
          mc.id === action.payload.id ? { ...mc, ...action.payload.updates } : mc
        ),
      };
      break;

    case 'SET_MUSIC_CLIP_POSITION': {
      const { id, timelinePosition } = action.payload;
      next = {
        ...state,
        musicClips: state.musicClips.map(mc =>
          mc.id === id ? { ...mc, timelinePosition: Math.max(0, timelinePosition) } : mc
        ),
      };
      break;
    }

    case 'SET_MUSIC_CLIP_TRIM': {
      const { id, trimStart, trimEnd, timelinePosition } = action.payload;
      next = {
        ...state,
        musicClips: state.musicClips.map(mc => {
          if (mc.id !== id) return mc;
          const updates: Partial<MusicClip> = { trimStart, trimEnd };
          if (timelinePosition !== undefined) updates.timelinePosition = Math.max(0, timelinePosition);
          return { ...mc, ...updates };
        }),
      };
      break;
    }

    case 'SPLIT_MUSIC_CLIP': {
      const { playheadPosition } = action.payload;
      let splitMcIdx = -1;

      for (let i = 0; i < state.musicClips.length; i++) {
        const mc = state.musicClips[i];
        const dur = getMusicClipDuration(mc);
        if (playheadPosition >= mc.timelinePosition && playheadPosition < mc.timelinePosition + dur) {
          splitMcIdx = i;
          break;
        }
      }

      if (splitMcIdx === -1) { next = state; break; }

      const origMc = state.musicClips[splitMcIdx];
      const elapsed = playheadPosition - origMc.timelinePosition;
      const splitSourceTime = origMc.trimStart + elapsed;

      if (splitSourceTime <= origMc.trimStart + 0.1 || splitSourceTime >= origMc.trimEnd - 0.1) {
        next = state;
        break;
      }

      const mcA: MusicClip = { ...origMc, id: generateId(), trimEnd: splitSourceTime };
      const mcB: MusicClip = {
        ...origMc,
        id: generateId(),
        trimStart: splitSourceTime,
        timelinePosition: origMc.timelinePosition + (splitSourceTime - origMc.trimStart),
      };

      const newMusicClips = [...state.musicClips];
      newMusicClips.splice(splitMcIdx, 1, mcA, mcB);

      next = { ...state, musicClips: newMusicClips, selectedMusicClipId: mcA.id };
      break;
    }

    case 'SELECT_MUSIC_CLIP':
      next = {
        ...state,
        selectedMusicClipId: action.payload,
        selectedClipIds: action.payload ? [] : state.selectedClipIds,
        activePanel: action.payload ? 'music' : state.activePanel,
      };
      break;

    // --- Snap & Ripple ---

    case 'SNAP_CLIPS_LEFT': {
      if (state.selectedClipIds.length === 0) { next = state; break; }
      const titleEnd = state.titleCard?.durationSeconds ?? 0;
      const delta = getSnapLeftDelta(state.selectedClipIds, state.clips, titleEnd);
      if (delta <= 0.001) { next = state; break; }
      const selectedSet = new Set(state.selectedClipIds);
      const updated = state.clips.map(c =>
        selectedSet.has(c.id) ? { ...c, timelinePosition: Math.max(0, c.timelinePosition - delta) } : c
      );
      next = { ...state, clips: clipsSortedByPosition(updated) };
      break;
    }

    case 'SNAP_CLIPS_RIGHT': {
      if (state.selectedClipIds.length === 0) { next = state; break; }
      const delta = getSnapRightDelta(state.selectedClipIds, state.clips);
      if (delta <= 0.001) { next = state; break; }
      const selectedSet = new Set(state.selectedClipIds);
      const updated = state.clips.map(c =>
        selectedSet.has(c.id) ? { ...c, timelinePosition: c.timelinePosition + delta } : c
      );
      next = { ...state, clips: clipsSortedByPosition(updated) };
      break;
    }

    case 'RIPPLE_DELETE': {
      if (state.selectedClipIds.length === 0) { next = state; break; }
      const newClips = rippleDeleteClips(state.selectedClipIds, state.clips);
      next = {
        ...state,
        clips: newClips,
        transitions: buildDefaultTransitions(newClips.length),
        selectedClipIds: [],
      };
      break;
    }

    default:
      return state;
  }

  // Recompute total duration on any state change
  next.totalDuration = getTotalDuration(next);
  return next;
}

// --- Context ---

const EditorStateContext = createContext<EditorState | null>(null);
const EditorDispatchContext = createContext<Dispatch<EditorAction> | null>(null);

// Actions that don't modify persistent state (skip auto-save for these)
const UI_ONLY_ACTIONS = new Set([
  'SET_PLAYHEAD', 'SET_PLAYING', 'SELECT_CLIP', 'SELECT_ALL_CLIPS',
  'DESELECT_ALL', 'SELECT_SUBTITLE', 'SELECT_MUSIC_CLIP',
  'SET_ACTIVE_PANEL', 'SET_EXPORT_PROGRESS',
]);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, createInitialState);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActionRef = useRef<string>('');

  // Wrap dispatch to track which actions trigger saves
  const wrappedDispatch: Dispatch<EditorAction> = (action) => {
    lastActionRef.current = action.type;
    dispatch(action);
  };

  // Auto-save: debounced 1s after persistent state changes
  useEffect(() => {
    if (!state.jobId || state.clips.length === 0) return;
    if (UI_ONLY_ACTIONS.has(lastActionRef.current)) return;
    if (lastActionRef.current === 'RESTORE') return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveEditorState(state);
    }, 1000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  return (
    <EditorStateContext.Provider value={state}>
      <EditorDispatchContext.Provider value={wrappedDispatch}>
        {children}
      </EditorDispatchContext.Provider>
    </EditorStateContext.Provider>
  );
}

export function useEditor(): EditorState {
  const ctx = useContext(EditorStateContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}

export function useEditorDispatch(): Dispatch<EditorAction> {
  const ctx = useContext(EditorDispatchContext);
  if (!ctx) throw new Error('useEditorDispatch must be used within EditorProvider');
  return ctx;
}
