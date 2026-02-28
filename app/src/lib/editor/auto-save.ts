/**
 * Editor auto-save: persists editor state to IndexedDB.
 * Strips session-specific fields (blobUrls) before saving.
 * On restore, blobUrls must be re-created by re-fetching sources.
 */

import type { EditorState, TimelineClip, MusicClip, SfxItem, TransitionType, Transition } from '@/types/editor';

const DB_NAME = 'glimmer-editor';

// Valid transition types (must match TransitionType in editor.ts)
const VALID_TRANSITION_TYPES: TransitionType[] = [
  'none', 'fade', 'fadeblack', 'fadewhite',
  'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'dissolve'
];

/** Migrate old transition types to new ones */
function migrateTransitions(transitions: Transition[]): Transition[] {
  return transitions.map(t => {
    // Handle old 'crossfade' type -> 'fade'
    if (t.type === 'crossfade' as TransitionType) {
      return { ...t, type: 'fade' as TransitionType };
    }
    // Handle any unknown types -> 'none'
    if (!VALID_TRANSITION_TYPES.includes(t.type)) {
      return { ...t, type: 'none' as TransitionType };
    }
    return t;
  });
}
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

// --- Serializable state (no blobUrls) ---

export interface SavedEditorState {
  jobId: string;
  jobName: string;
  clips: Omit<TimelineClip, 'blobUrl'>[];
  transitions: EditorState['transitions'];
  subtitles: EditorState['subtitles'];
  musicClips: Omit<MusicClip, 'blobUrl'>[];
  sfx: Omit<SfxItem, 'blobUrl'>[];
  titleCard: EditorState['titleCard'];
  outroCard: EditorState['outroCard'];
  trackStates: EditorState['trackStates'];
  savedAt: string;
}

// --- IndexedDB helpers ---

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'jobId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- Public API ---

/** Strip blobUrls and save state to IndexedDB. */
export async function saveEditorState(state: EditorState): Promise<void> {
  if (!state.jobId || state.clips.length === 0) return;

  try {
    const saved: SavedEditorState = {
      jobId: state.jobId,
      jobName: state.jobName,
      clips: state.clips.map(({ blobUrl: _blobUrl, ...rest }) => rest),
      transitions: state.transitions,
      subtitles: state.subtitles,
      musicClips: state.musicClips.map(({ blobUrl: _blobUrl, ...rest }) => rest),
      sfx: state.sfx.map(({ blobUrl: _blobUrl, ...rest }) => rest),
      titleCard: state.titleCard,
      outroCard: state.outroCard,
      trackStates: state.trackStates,
      savedAt: new Date().toISOString(),
    };

    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(saved);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[AutoSave] Failed to save:', err);
  }
}

/** Load saved state from IndexedDB (returns null if none). */
export async function loadEditorState(jobId: string): Promise<SavedEditorState | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(jobId);

    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        db.close();
        const result = req.result as SavedEditorState | undefined;
        if (!result) {
          resolve(null);
          return;
        }
        // Migrate old transition types
        resolve({
          ...result,
          transitions: migrateTransitions(result.transitions),
        });
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch (err) {
    console.warn('[AutoSave] Failed to load:', err);
    return null;
  }
}

/** Delete saved state for a job. */
export async function clearEditorState(jobId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(jobId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[AutoSave] Failed to clear:', err);
  }
}
