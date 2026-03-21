'use client';

import { createContext, useContext, useReducer, useEffect, useRef, useCallback, type ReactNode, type Dispatch } from 'react';
import { saveEditorState } from '@/lib/editor/auto-save';
import type { EditorState, EditorAction } from '@/types/editor';
import { historyReducer, createInitialHistory } from './editorReducer';

// --- Context ---

const EditorStateContext = createContext<EditorState | null>(null);
const EditorDispatchContext = createContext<Dispatch<EditorAction> | null>(null);
const EditorHistoryContext = createContext<{ canUndo: boolean; canRedo: boolean } | null>(null);

// Actions that don't modify persistent state (skip auto-save for these)
const UI_ONLY_ACTIONS = new Set([
  'SET_PLAYHEAD', 'SET_PLAYING', 'SELECT_CLIP', 'SELECT_ALL_CLIPS',
  'DESELECT_ALL', 'SELECT_SUBTITLE', 'SELECT_MUSIC_CLIP',
  'SET_ACTIVE_PANEL', 'SET_EXPORT_PROGRESS', 'UNDO', 'REDO',
]);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer, undefined, createInitialHistory);
  const state = history.present;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActionRef = useRef<string>('');

  // Wrap dispatch to track which actions trigger saves
  const wrappedDispatch: Dispatch<EditorAction> = useCallback((action) => {
    lastActionRef.current = action.type;
    dispatch(action);
  }, []);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Cmd+Z (Mac) or Ctrl+Z (Windows) for undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        wrappedDispatch({ type: 'UNDO' });
      }
      // Cmd+Shift+Z (Mac) or Ctrl+Shift+Z / Ctrl+Y (Windows) for redo
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        wrappedDispatch({ type: 'REDO' });
      }
      else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        wrappedDispatch({ type: 'REDO' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wrappedDispatch]);

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

  const historyInfo = {
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };

  return (
    <EditorStateContext.Provider value={state}>
      <EditorDispatchContext.Provider value={wrappedDispatch}>
        <EditorHistoryContext.Provider value={historyInfo}>
          {children}
        </EditorHistoryContext.Provider>
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

export function useEditorHistory(): { canUndo: boolean; canRedo: boolean } {
  const ctx = useContext(EditorHistoryContext);
  if (!ctx) throw new Error('useEditorHistory must be used within EditorProvider');
  return ctx;
}
