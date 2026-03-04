'use client';

import { useState, useEffect, useRef, use } from 'react';
import { EditorProvider, useEditorDispatch } from '@/components/editor/EditorContext';
import { EditorLayout } from '@/components/editor/EditorLayout';
import { AccessGate } from '@/components/AccessGate';
import { generateId } from '@/lib/editor/timeline-utils';
import { loadEditorState, clearEditorState, type SavedEditorState } from '@/lib/editor/auto-save';
import type { EditorState, TimelineClip } from '@/types/editor';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { trackEditorOpen } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { getVideoDuration } from '@/lib/media-utils';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface JobData {
  id: string;
  name: string;
  occasion: string;
  videoUrl: string;
  videoUrls?: string[];
  createdAt: string;
  email?: string;
  settings?: {
    model: string;
    aspectRatio: string;
    videoLength: number;
    resolution: string;
  };
}

export default function EditPage({ params }: PageProps) {
  const { id } = use(params);

  return (
    <AccessGate>
      <EditorProvider>
        <EditorLoader jobId={id} />
      </EditorProvider>
    </AccessGate>
  );
}

function EditorLoader({ jobId }: { jobId: string }) {
  const dispatch = useEditorDispatch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedSession, setSavedSession] = useState<SavedEditorState | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const blobUrlsRef = useRef<string[]>([]);

  // Check for saved session on mount
  useEffect(() => {
    loadEditorState(jobId).then(saved => {
      if (saved && saved.clips.length > 0) {
        setSavedSession(saved);
        setShowRestore(true);
        setLoading(false);
      } else {
        // No saved session — load fresh
        loadFresh();
      }
    }).catch(() => {
      loadFresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function loadFresh() {
    try {
      // Fetch job metadata
      const res = await fetch(`/api/gallery/${jobId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '載入失敗');
      }
      const job: JobData = await res.json();

      const videoCount = job.videoUrls?.length || 1;

      // Fetch all video blobs via server-side proxy (bypasses CORS)
      const clips = await Promise.all(
        Array.from({ length: videoCount }, async (_, index): Promise<TimelineClip> => {
          const proxyUrl = `/api/proxy-video?jobId=${encodeURIComponent(job.id)}&index=${index}`;
          const blob = await fetchVideoBlob(proxyUrl);
          const blobUrl = URL.createObjectURL(blob);
          blobUrlsRef.current.push(blobUrl);
          const duration = await getVideoDuration(blobUrl);

          return {
            id: generateId(),
            sourceUrl: job.videoUrls?.[index] || job.videoUrl,
            blobUrl,
            originalDuration: duration,
            trimStart: 0,
            trimEnd: duration,
            speed: 1,
            filter: null,
            volume: 1,
            timelinePosition: 0,
          };
        })
      );

      dispatch({
        type: 'INIT',
        payload: {
          jobId: job.id,
          jobName: job.name || '未命名影片',
          clips,
          email: job.email,
        },
      });

      trackEditorOpen(clips.length);
      setShowRestore(false);
      setLoading(false);
    } catch (err) {
      logger.error('Failed to load editor:', err);
      setError(err instanceof Error ? err.message : '載入編輯器失敗');
      setLoading(false);
    }
  }

  async function handleRestore() {
    if (!savedSession) return;
    setLoading(true);
    setShowRestore(false);

    try {
      // Re-create blobUrls for video clips by fetching from their actual sourceUrl
      const restoredClips: TimelineClip[] = await Promise.all(
        savedSession.clips.map(async (clip) => {
          let fetchUrl: string;
          const sourceUrl = clip.sourceUrl || '';

          if (sourceUrl.startsWith('http')) {
            // CDN URL - fetch via proxy to handle CORS
            // We need to find which job this clip belongs to and its index
            // For now, fetch directly (might work for some CDNs)
            // Better: parse jobId from URL or use a generic proxy
            fetchUrl = sourceUrl;
          } else if (sourceUrl.startsWith('/api/proxy-video') || sourceUrl.startsWith('/api/proxy-r2')) {
            // Already a proxy URL
            fetchUrl = sourceUrl;
          } else if (sourceUrl.startsWith('uploads/')) {
            // Uploaded local file stored in R2
            fetchUrl = `/api/proxy-r2?key=${encodeURIComponent(sourceUrl)}`;
          } else if (sourceUrl.startsWith('local://')) {
            // Local file - can't restore, return empty blobUrl
            logger.warn(`[Restore] Cannot restore local file: ${sourceUrl}`);
            return { ...clip, blobUrl: '' } as TimelineClip;
          } else if (sourceUrl) {
            // R2 key - extract jobId and index from pattern: videos/{jobId}/{index}.mp4
            const r2Match = sourceUrl.match(/videos\/([^/]+)\/(\d+)\.mp4/);
            if (r2Match) {
              const [, r2JobId, r2Index] = r2Match;
              fetchUrl = `/api/proxy-video?jobId=${encodeURIComponent(r2JobId)}&index=${r2Index}`;
            } else {
              // Fallback to current job
              fetchUrl = `/api/proxy-video?jobId=${encodeURIComponent(jobId)}&index=0`;
            }
          } else {
            // No sourceUrl - fallback
            fetchUrl = `/api/proxy-video?jobId=${encodeURIComponent(jobId)}&index=0`;
          }

          try {
            const blob = await fetchVideoBlob(fetchUrl);
            const blobUrl = URL.createObjectURL(blob);
            blobUrlsRef.current.push(blobUrl);
            return { ...clip, blobUrl } as TimelineClip;
          } catch (err) {
            logger.error(`[Restore] Failed to fetch clip: ${sourceUrl}`, err);
            return { ...clip, blobUrl: '' } as TimelineClip;
          }
        })
      );

      // Re-create blobUrls for music clips
      const restoredMusic = await Promise.all(
        savedSession.musicClips.map(async mc => {
          const audioSrc = mc.type === 'bundled' ? `/audio/bundled/${mc.src}` : mc.src;
          try {
            const res = await fetch(audioSrc);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            blobUrlsRef.current.push(blobUrl);
            return { ...mc, blobUrl };
          } catch {
            return { ...mc, blobUrl: '' };
          }
        })
      );

      // SFX blobUrls can't be restored (uploaded files) — clear them
      const restoredSfx = savedSession.sfx.map(s => ({ ...s, blobUrl: '' }));

      const restoredState: EditorState = {
        jobId: savedSession.jobId,
        jobName: savedSession.jobName,
        clips: restoredClips,
        transitions: savedSession.transitions,
        subtitles: savedSession.subtitles,
        musicClips: restoredMusic,
        sfx: restoredSfx,
        titleCard: savedSession.titleCard,
        outroCard: savedSession.outroCard,
        trackStates: savedSession.trackStates,
        playheadPosition: 0,
        isPlaying: false,
        selectedClipIds: [],
        selectedMusicClipId: null,
        selectedSubtitleId: null,
        activePanel: 'clips',
        exportProgress: null,
        totalDuration: 0,
      };

      dispatch({ type: 'RESTORE', payload: restoredState });
      setLoading(false);
    } catch (err) {
      logger.error('Failed to restore session:', err);
      // Fall back to fresh load
      await loadFresh();
    }
  }

  function handleStartFresh() {
    clearEditorState(jobId);
    setSavedSession(null);
    setShowRestore(false);
    setLoading(true);
    loadFresh();
  }

  // Cleanup: revoke all blob URLs when component unmounts
  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      blobUrlsRef.current = [];
    };
  }, []);

  if (showRestore && savedSession) {
    const savedDate = new Date(savedSession.savedAt);
    const timeAgo = getTimeAgo(savedDate);
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">找到未儲存的編輯內容</h2>
          <p className="text-muted-foreground text-sm">
            您在 {timeAgo} 有未完成的編輯工作，包含 {savedSession.clips.length} 個片段
            {savedSession.subtitles.length > 0 && `、${savedSession.subtitles.length} 條字幕`}
            {savedSession.musicClips.length > 0 && `、${savedSession.musicClips.length} 首音樂`}
            。要恢復嗎？
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleRestore}>恢復編輯</Button>
          <Button variant="outline" onClick={handleStartFresh}>重新開始</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        <p className="text-muted-foreground">正在載入影片...</p>
        <p className="text-xs text-muted-foreground">下載影片素材中，請稍候</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" asChild>
          <Link href="/gallery">
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回影片庫
          </Link>
        </Button>
      </div>
    );
  }

  return <EditorLayout />;
}

/** Fetch a video via proxy as a Blob (with 60s timeout) */
async function fetchVideoBlob(proxyUrl: string): Promise<Blob> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(proxyUrl, { signal: controller.signal });
    if (!res.ok) {
      try {
        const data = await res.json();
        throw new Error(data.error || `影片載入失敗 (${res.status})`);
      } catch (e) {
        if (e instanceof Error && e.message.includes('影片載入失敗')) throw e;
        throw new Error(`影片載入失敗 (${res.status})`);
      }
    }
    return res.blob();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('影片下載逾時，請重新載入頁面 (Video download timed out)');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Format a date as relative time (e.g. "5 分鐘前") */
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return '剛才';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

