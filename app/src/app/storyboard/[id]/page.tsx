'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { StoryboardGrid } from '@/components/storyboard/StoryboardGrid';
import type { Storyboard, StoryboardSlot, StoryboardTransitionType, GenerationJob } from '@/types';

export default function StoryboardEditorPage() {
  const params = useParams();
  const router = useRouter();
  const storyboardId = params.id as string;

  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [galleryJobs, setGalleryJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
        setStoryboard(storyboardData.storyboard);

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

      // Optimistic update
      setStoryboard((prev) => {
        if (!prev) return prev;
        const newSlots = [...prev.slots];
        newSlots[slotIndex] = { ...newSlots[slotIndex], ...slotUpdate };
        return { ...prev, slots: newSlots };
      });

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
        setStoryboard(data.storyboard);
      } catch (err) {
        console.error('Error updating slot:', err);
        // Revert on error - refetch
        const res = await fetch(`/api/storyboards/${storyboardId}`);
        if (res.ok) {
          const data = await res.json();
          setStoryboard(data.storyboard);
        }
      } finally {
        setSaving(false);
      }
    },
    [storyboard, storyboardId]
  );

  const handleUpdateTransition = useCallback(
    async (transitionIndex: number, transition: StoryboardTransitionType) => {
      if (!storyboard) return;

      // Optimistic update
      setStoryboard((prev) => {
        if (!prev) return prev;
        const newTransitions = [...prev.transitions];
        newTransitions[transitionIndex] = transition;
        return { ...prev, transitions: newTransitions };
      });

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
        setStoryboard(data.storyboard);
      } catch (err) {
        console.error('Error updating transition:', err);
      } finally {
        setSaving(false);
      }
    },
    [storyboard, storyboardId]
  );

  const handleReorderSlots = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!storyboard) return;

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
        setStoryboard(data.storyboard);
      } catch (err) {
        console.error('Error reordering slots:', err);
      } finally {
        setSaving(false);
      }
    },
    [storyboard, storyboardId]
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
            <Button variant="outline" size="sm" disabled={!canExport}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              預覽
            </Button>
            <Button size="sm" disabled={!canExport}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              匯出影片
            </Button>
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
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
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
        </div>
      </div>
    </div>
  );
}
