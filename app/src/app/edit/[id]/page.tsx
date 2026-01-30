'use client';

export const runtime = 'edge';

import { useState, useEffect, use } from 'react';
import { EditorProvider, useEditorDispatch } from '@/components/editor/EditorContext';
import { EditorLayout } from '@/components/editor/EditorLayout';
import { generateId } from '@/lib/editor/timeline-utils';
import type { TimelineClip } from '@/types/editor';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

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
    <EditorProvider>
      <EditorLoader jobId={id} />
    </EditorProvider>
  );
}

function EditorLoader({ jobId }: { jobId: string }) {
  const dispatch = useEditorDispatch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadJob() {
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
              timelinePosition: 0, // INIT reducer will set sequential positions
            };
          })
        );

        dispatch({
          type: 'INIT',
          payload: {
            jobId: job.id,
            jobName: job.name || '未命名影片',
            clips,
          },
        });

        setLoading(false);
      } catch (err) {
        console.error('Failed to load editor:', err);
        setError(err instanceof Error ? err.message : '載入編輯器失敗');
        setLoading(false);
      }
    }

    loadJob();
  }, [jobId, dispatch]);

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

/** Fetch a video via proxy as a Blob */
async function fetchVideoBlob(proxyUrl: string): Promise<Blob> {
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    // Try to get error message from JSON response
    try {
      const data = await res.json();
      throw new Error(data.error || `影片載入失敗 (${res.status})`);
    } catch (e) {
      if (e instanceof Error && e.message !== `影片載入失敗 (${res.status})`) throw e;
      throw new Error(`影片載入失敗 (${res.status})`);
    }
  }
  return res.blob();
}

/** Get video duration using an off-screen video element */
function getVideoDuration(blobUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = blobUrl;

    video.onloadedmetadata = () => {
      resolve(video.duration);
      video.src = '';
    };

    video.onerror = () => {
      video.src = '';
      reject(new Error('Failed to load video metadata'));
    };
  });
}
