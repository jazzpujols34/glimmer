'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { AccessGate } from '@/components/AccessGate';
import { StoryboardGrid } from '@/components/storyboard/StoryboardGrid';
import { StoryboardExportModal } from '@/components/storyboard/StoryboardExportModal';
import { StoryboardPreviewModal } from '@/components/storyboard/StoryboardPreviewModal';
import { TitleCardModal } from '@/components/storyboard/TitleCardModal';
import { MusicModal } from '@/components/storyboard/MusicModal';
import type { Storyboard, StoryboardSlot, StoryboardTransitionType, StoryboardTitleCard, StoryboardMusic, GenerationJob } from '@/types';
import { logger } from '@/lib/logger';

// --- Undo/Redo History ---
const MAX_HISTORY_SIZE = 30;

interface HistoryState {
  past: Storyboard[];
  present: Storyboard | null;
  future: Storyboard[];
}

function useStoryboardHistory(
  initial: Storyboard | null,
  syncToServer: (storyboard: Storyboard) => Promise<void>
) {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: initial,
    future: [],
  });

  // Update present when initial changes (e.g., after fetch)
  useEffect(() => {
    if (initial && !history.present) {
      setHistory({ past: [], present: initial, future: [] });
    }
  }, [initial, history.present]);

  const pushState = useCallback((newState: Storyboard) => {
    setHistory((h) => {
      if (!h.present) return { ...h, present: newState };
      // Don't push if state hasn't changed
      if (JSON.stringify(h.present) === JSON.stringify(newState)) return h;

      const newPast = [...h.past, h.present];
      if (newPast.length > MAX_HISTORY_SIZE) {
        newPast.shift();
      }
      return {
        past: newPast,
        present: newState,
        future: [], // Clear future on new action
      };
    });
  }, []);

  const undo = useCallback(async () => {
    setHistory((h) => {
      if (h.past.length === 0 || !h.present) return h;
      const previous = h.past[h.past.length - 1];
      const newPast = h.past.slice(0, -1);
      // Sync to server (fire and forget, will be awaited outside)
      syncToServer(previous);
      return {
        past: newPast,
        present: previous,
        future: [h.present, ...h.future],
      };
    });
  }, [syncToServer]);

  const redo = useCallback(async () => {
    setHistory((h) => {
      if (h.future.length === 0 || !h.present) return h;
      const next = h.future[0];
      const newFuture = h.future.slice(1);
      // Sync to server
      syncToServer(next);
      return {
        past: [...h.past, h.present],
        present: next,
        future: newFuture,
      };
    });
  }, [syncToServer]);

  return {
    storyboard: history.present,
    setStoryboard: pushState,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    // Direct set without history (for server responses)
    setStoryboardDirect: (s: Storyboard) => setHistory((h) => ({ ...h, present: s })),
  };
}

export default function StoryboardEditorPage() {
  return (
    <AccessGate>
      <StoryboardEditorPageContent />
    </AccessGate>
  );
}

function StoryboardEditorPageContent() {
  const params = useParams();
  const router = useRouter();
  const storyboardId = params.id as string;

  const [initialStoryboard, setInitialStoryboard] = useState<Storyboard | null>(null);
  const [galleryJobs, setGalleryJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showTitleCardModal, setShowTitleCardModal] = useState(false);
  const [showMusicModal, setShowMusicModal] = useState(false);

  // Track in-flight updates to prevent race conditions
  const updatingSlots = useRef<Set<number>>(new Set());
  const updatingTransitions = useRef<Set<number>>(new Set());
  const isReordering = useRef(false);

  // Sync storyboard to server (for undo/redo)
  const syncToServer = useCallback(async (s: Storyboard) => {
    setSaving(true);
    try {
      await fetch(`/api/storyboards/${storyboardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fullUpdate', storyboard: s }),
      });
    } catch (err) {
      logger.error('Error syncing to server:', err);
    } finally {
      setSaving(false);
    }
  }, [storyboardId]);

  // Use history hook for undo/redo
  const {
    storyboard,
    setStoryboard,
    undo,
    redo,
    canUndo,
    canRedo,
    setStoryboardDirect,
  } = useStoryboardHistory(initialStoryboard, syncToServer);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      } else if (modifier && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (canRedo) redo();
      } else if (modifier && e.key === 'y') {
        e.preventDefault();
        if (canRedo) redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  // Fetch storyboard and gallery jobs
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [storyboardRes, galleryRes] = await Promise.all([
          fetch(`/api/storyboards/${storyboardId}`),
          fetch('/api/gallery'),
        ]);

        if (!storyboardRes.ok) {
          throw new Error('找不到此故事板');
        }

        const storyboardData = await storyboardRes.json();
        setInitialStoryboard(storyboardData.storyboard);

        if (galleryRes.ok) {
          const galleryData = await galleryRes.json();
          setGalleryJobs(galleryData.jobs || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [storyboardId]);

  const handleUpdateSlot = useCallback(
    async (slotIndex: number, slotUpdate: Partial<StoryboardSlot>) => {
      if (!storyboard) return;

      // Prevent duplicate updates for the same slot
      if (updatingSlots.current.has(slotIndex)) {
        logger.warn(`Slot ${slotIndex} is already being updated, skipping`);
        return;
      }

      // Create new state for history
      const newSlots = [...storyboard.slots];
      newSlots[slotIndex] = { ...newSlots[slotIndex], ...slotUpdate };
      const newStoryboard = { ...storyboard, slots: newSlots };

      // Push to history (triggers UI update)
      setStoryboard(newStoryboard);

      updatingSlots.current.add(slotIndex);
      setSaving(true);
      try {
        const res = await fetch(`/api/storyboards/${storyboardId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'updateSlot',
            slotIndex,
            slot: slotUpdate,
          }),
        });

        if (!res.ok) {
          throw new Error('更新失敗');
        }

        const data = await res.json();
        // Update directly without adding to history (server confirmed)
        setStoryboardDirect(data.storyboard);
      } catch (err) {
        logger.error('Error updating slot:', err);
        // Revert on error - refetch
        const res = await fetch(`/api/storyboards/${storyboardId}`);
        if (res.ok) {
          const data = await res.json();
          setStoryboardDirect(data.storyboard);
        }
      } finally {
        updatingSlots.current.delete(slotIndex);
        setSaving(false);
      }
    },
    [storyboard, storyboardId, setStoryboard, setStoryboardDirect]
  );

  const handleUpdateTransition = useCallback(
    async (transitionIndex: number, transition: StoryboardTransitionType) => {
      if (!storyboard) return;

      // Prevent duplicate updates for the same transition
      if (updatingTransitions.current.has(transitionIndex)) {
        return;
      }

      // Create new state for history
      const newTransitions = [...storyboard.transitions];
      newTransitions[transitionIndex] = transition;
      const newStoryboard = { ...storyboard, transitions: newTransitions };

      // Push to history
      setStoryboard(newStoryboard);

      updatingTransitions.current.add(transitionIndex);
      setSaving(true);
      try {
        const res = await fetch(`/api/storyboards/${storyboardId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'updateTransition',
            transitionIndex,
            transition,
          }),
        });

        if (!res.ok) {
          throw new Error('更新失敗');
        }

        const data = await res.json();
        setStoryboardDirect(data.storyboard);
      } catch (err) {
        logger.error('Error updating transition:', err);
      } finally {
        updatingTransitions.current.delete(transitionIndex);
        setSaving(false);
      }
    },
    [storyboard, storyboardId, setStoryboard, setStoryboardDirect]
  );

  const handleReorderSlots = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!storyboard) return;

      // Prevent concurrent reorder operations
      if (isReordering.current) {
        logger.warn('Reorder already in progress, skipping');
        return;
      }

      // Optimistic reorder for history
      const newSlots = [...storyboard.slots];
      const [removed] = newSlots.splice(fromIndex, 1);
      newSlots.splice(toIndex, 0, removed);
      // Update indices
      newSlots.forEach((slot, i) => (slot.index = i));
      const newStoryboard = { ...storyboard, slots: newSlots };

      // Push to history
      setStoryboard(newStoryboard);

      isReordering.current = true;
      setSaving(true);
      try {
        const res = await fetch(`/api/storyboards/${storyboardId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reorderSlots',
            fromIndex,
            toIndex,
          }),
        });

        if (!res.ok) {
          throw new Error('重新排序失敗');
        }

        const data = await res.json();
        setStoryboardDirect(data.storyboard);
      } catch (err) {
        logger.error('Error reordering slots:', err);
        // Revert on error - refetch
        const res = await fetch(`/api/storyboards/${storyboardId}`);
        if (res.ok) {
          const data = await res.json();
          setStoryboardDirect(data.storyboard);
        }
      } finally {
        isReordering.current = false;
        setSaving(false);
      }
    },
    [storyboard, storyboardId, setStoryboard, setStoryboardDirect]
  );

  const handleDelete = async () => {
    if (!confirm('確定要刪除此故事板嗎？')) return;

    try {
      const res = await fetch(`/api/storyboards/${storyboardId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('刪除失敗');
      }

      router.push('/gallery');
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除失敗');
    }
  };

  const handleSaveTitleCards = async (
    titleCard: StoryboardTitleCard | null,
    outroCard: StoryboardTitleCard | null
  ) => {
    if (!storyboard) return;

    // Push to history before saving
    const newStoryboard = {
      ...storyboard,
      titleCard: titleCard || undefined,
      outroCard: outroCard || undefined,
    };
    setStoryboard(newStoryboard);

    setSaving(true);
    try {
      // Update title card
      await fetch(`/api/storyboards/${storyboardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateTitleCard', titleCard }),
      });

      // Update outro card
      const res = await fetch(`/api/storyboards/${storyboardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateOutroCard', outroCard }),
      });

      if (res.ok) {
        const data = await res.json();
        setStoryboardDirect(data.storyboard);
      }
    } catch (err) {
      logger.error('Error saving title cards:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMusic = async (music: StoryboardMusic | null) => {
    if (!storyboard) return;

    // Push to history before saving
    const newStoryboard = {
      ...storyboard,
      music: music || undefined,
    };
    setStoryboard(newStoryboard);

    setSaving(true);
    try {
      const res = await fetch(`/api/storyboards/${storyboardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateMusic', music }),
      });

      if (res.ok) {
        const data = await res.json();
        setStoryboardDirect(data.storyboard);
      }
    } catch (err) {
      logger.error('Error saving music:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  if (error || !storyboard) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-destructive mb-4">{error || '找不到故事板'}</p>
          <Button asChild>
            <Link href="/gallery">返回影片庫</Link>
          </Button>
        </div>
      </div>
    );
  }

  const filledCount = storyboard.slots.filter((s) => s.status === 'filled').length;
  const canExport = filledCount > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo compact />
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="font-semibold">{storyboard.name}</h1>
              <p className="text-xs text-muted-foreground">
                故事板 · {storyboard.slotCount} 格 · {storyboard.aspectRatio}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                儲存中
              </span>
            )}
            {/* Undo/Redo Buttons */}
            <div className="flex items-center border-r border-border pr-2 mr-1">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="復原 (Cmd+Z)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="重做 (Cmd+Shift+Z)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                </svg>
              </button>
            </div>
            {/* Title Cards Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTitleCardModal(true)}
              className={storyboard.titleCard || storyboard.outroCard ? 'border-primary/50' : ''}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              片頭/片尾
            </Button>
            {/* Music Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMusicModal(true)}
              className={storyboard.music ? 'border-primary/50' : ''}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              背景音樂
            </Button>
            {/* Preview Button */}
            <Button
              variant="outline"
              size="sm"
              disabled={!canExport}
              onClick={() => setShowPreviewModal(true)}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              預覽
            </Button>
            {/* Export Button */}
            <Button size="sm" disabled={!canExport} onClick={() => setShowExportModal(true)}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              匯出影片
            </Button>
            {/* Delete Button */}
            <button
              onClick={handleDelete}
              className="p-2 text-muted-foreground hover:text-destructive transition-colors"
              title="刪除故事板"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <StoryboardGrid
          storyboard={storyboard}
          onUpdateSlot={handleUpdateSlot}
          onUpdateTransition={handleUpdateTransition}
          onReorderSlots={handleReorderSlots}
          galleryJobs={galleryJobs}
        />
      </main>

      {/* Help Text */}
      <div className="container mx-auto px-4 py-4 border-t border-border/50">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            點擊空格新增影片
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
            拖曳影片格調整順序
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            點擊格子之間的圖示設定轉場效果
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 text-[10px] bg-muted rounded">⌘Z</kbd>
            復原
            <kbd className="px-1 py-0.5 text-[10px] bg-muted rounded ml-2">⌘⇧Z</kbd>
            重做
          </span>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && storyboard && (
        <StoryboardExportModal
          storyboard={storyboard}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Preview Modal */}
      {showPreviewModal && storyboard && (
        <StoryboardPreviewModal
          storyboard={storyboard}
          onClose={() => setShowPreviewModal(false)}
        />
      )}

      {/* Title Card Modal */}
      {showTitleCardModal && storyboard && (
        <TitleCardModal
          titleCard={storyboard.titleCard}
          outroCard={storyboard.outroCard}
          onSave={handleSaveTitleCards}
          onClose={() => setShowTitleCardModal(false)}
        />
      )}

      {/* Music Modal */}
      {showMusicModal && storyboard && (
        <MusicModal
          storyboardId={storyboard.id}
          music={storyboard.music}
          onSave={handleSaveMusic}
          onClose={() => setShowMusicModal(false)}
        />
      )}
    </div>
  );
}
