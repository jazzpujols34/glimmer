'use client';

import { useEffect, useState } from 'react';
import type { TimelineClip as TimelineClipType } from '@/types/editor';
import { getClipDuration } from '@/lib/editor/timeline-utils';
import { cn } from '@/lib/utils';

interface TimelineClipProps {
  clip: TimelineClipType;
  index: number;
  isSelected: boolean;
}

export function TimelineClipComponent({
  clip,
  index,
  isSelected,
}: TimelineClipProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const duration = getClipDuration(clip);

  // Extract thumbnail from video blob
  useEffect(() => {
    if (!clip.blobUrl) return;

    const video = document.createElement('video');
    video.src = clip.blobUrl;
    video.muted = true;
    video.preload = 'metadata';

    video.onloadeddata = () => {
      video.currentTime = clip.trimStart + 0.1;
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 68;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, 120, 68);
        setThumbnail(canvas.toDataURL('image/jpeg', 0.6));
      }
      video.src = '';
    };

    video.onerror = () => {
      video.src = '';
    };

    return () => {
      video.src = '';
    };
  }, [clip.blobUrl, clip.trimStart]);

  return (
    <div
      data-clip-id={clip.id}
      className={cn(
        'relative w-full h-full rounded-md overflow-hidden cursor-grab active:cursor-grabbing border-2 transition-all select-none',
        isSelected
          ? 'border-primary ring-2 ring-primary/30'
          : 'border-border hover:border-primary/50'
      )}
    >
      {/* Thumbnail background */}
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnail}
          alt={`Clip ${index + 1}`}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30 flex items-end p-1">
        <span className="text-[10px] text-white font-medium">
          {duration.toFixed(1)}s
        </span>
        {clip.speed !== 1 && (
          <span className="text-[10px] text-white/80 ml-auto bg-black/50 rounded px-1">
            {clip.speed}x
          </span>
        )}
        {clip.filter && (
          <span className="text-[10px] text-white/80 ml-1 bg-black/50 rounded px-1">
            {clip.filter}
          </span>
        )}
      </div>

      {/* Clip number */}
      <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center">
        <span className="text-[9px] text-white font-bold">{index + 1}</span>
      </div>
    </div>
  );
}
