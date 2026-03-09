'use client';

import { useState, useRef, useEffect } from 'react';
import type { StoryboardSlot, AspectRatio } from '@/types';
import { CardPreview } from './CardEditor';

interface SlotCardProps {
  slot: StoryboardSlot;
  targetAspectRatio: AspectRatio;
  onAddClick: () => void;
  onRemoveClick: () => void;
  onEditTextCard?: () => void;
  onTrimClick?: () => void;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function SlotCard({
  slot,
  targetAspectRatio,
  onAddClick,
  onRemoveClick,
  onEditTextCard,
  onTrimClick,
  isDragging,
  dragHandleProps,
}: SlotCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Generate thumbnail from video
  useEffect(() => {
    if (slot.status !== 'filled' || !slot.clip?.videoUrl) {
      setThumbnailUrl(null);
      return;
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    video.onloadeddata = () => {
      video.currentTime = 0.5;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = targetAspectRatio === '16:9' ? 90 : 284;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setThumbnailUrl(canvas.toDataURL('image/jpeg', 0.7));
        }
      } catch {
        // CORS or other error
      }
    };

    video.src = slot.clip.videoUrl;
    video.load();

    return () => {
      video.src = '';
    };
  }, [slot.status, slot.clip?.videoUrl, targetAspectRatio]);

  const aspectClass = targetAspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]';
  const hasMismatch = slot.clip?.originalAspectRatio && slot.clip.originalAspectRatio !== targetAspectRatio;
  const isTrimmed = slot.clip && (slot.clip.trimStart !== undefined && slot.clip.trimStart > 0 || slot.clip.trimEnd !== undefined && slot.clip.trimEnd < slot.clip.duration);
  const effectiveDuration = slot.clip ? (slot.clip.trimEnd ?? slot.clip.duration) - (slot.clip.trimStart ?? 0) : 0;
  const isFilledOrCard = slot.status === 'filled' || slot.status === 'text-card';

  return (
    <div
      className={`relative rounded-lg overflow-hidden transition-all ${
        isDragging ? 'opacity-50 scale-95' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Slot Number Badge */}
      <div className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-xs font-medium text-white">
        {slot.index + 1}
      </div>

      {/* Drag Handle */}
      {isFilledOrCard && dragHandleProps && (
        <div
          {...dragHandleProps}
          className="absolute top-2 right-2 z-10 w-6 h-6 rounded bg-black/60 flex items-center justify-center cursor-grab active:cursor-grabbing"
        >
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`${aspectClass} bg-muted border-2 border-dashed border-border rounded-lg`}>
        {slot.status === 'empty' && (
          <button
            onClick={onAddClick}
            className="w-full h-full flex flex-col items-center justify-center gap-2 hover:bg-muted/80 transition-colors group"
          >
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-xs text-muted-foreground">新增內容</span>
          </button>
        )}

        {slot.status === 'uploading' && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-muted/50">
            <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs text-muted-foreground">
              上傳中 {slot.uploadProgress || 0}%
            </span>
            <div className="w-3/4 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${slot.uploadProgress || 0}%` }}
              />
            </div>
          </div>
        )}

        {slot.status === 'text-card' && slot.textCard && (
          <div className="relative w-full h-full">
            {/* Text Card Preview — uses template layout */}
            <CardPreview card={slot.textCard} className="w-full h-full rounded-lg" />

            {/* Duration Badge */}
            <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white">
              {slot.textCard.durationSeconds}s
            </div>

            {/* Type Badge */}
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-primary/80 rounded text-xs text-white">
              文字卡
            </div>

            {/* Hover Overlay with Edit + Remove */}
            {isHovered && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2">
                {onEditTextCard && (
                  <button
                    onClick={onEditTextCard}
                    className="p-2 bg-primary rounded-full hover:bg-primary/80 transition-colors"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={onRemoveClick}
                  className="p-2 bg-destructive rounded-full hover:bg-destructive/80 transition-colors"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}

        {slot.status === 'filled' && slot.clip && (
          <div className="relative w-full h-full">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={`Slot ${slot.index + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                ref={videoRef}
                src={slot.clip.videoUrl}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
                onMouseEnter={(e) => {
                  const video = e.currentTarget;
                  video.currentTime = 0;
                  video.play().catch(() => {});
                }}
                onMouseLeave={(e) => {
                  const video = e.currentTarget;
                  video.pause();
                  video.currentTime = 0;
                }}
              />
            )}

            {/* Duration Badge */}
            <div className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-xs text-white ${isTrimmed ? 'bg-primary/80' : 'bg-black/70'}`}>
              {effectiveDuration.toFixed(1)}s
              {isTrimmed && ' ✂'}
            </div>

            {/* Aspect Ratio Mismatch Warning */}
            {hasMismatch && (
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-amber-500/90 rounded text-xs text-white flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {slot.clip.fitMode === 'letterbox' ? '黑邊' : '裁切'}
              </div>
            )}

            {/* Hover Overlay with Trim + Remove Buttons */}
            {isHovered && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2">
                {onTrimClick && (
                  <button
                    onClick={onTrimClick}
                    className="p-2 bg-primary rounded-full hover:bg-primary/80 transition-colors"
                    title="裁剪"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={onRemoveClick}
                  className="p-2 bg-destructive rounded-full hover:bg-destructive/80 transition-colors"
                  title="移除"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
