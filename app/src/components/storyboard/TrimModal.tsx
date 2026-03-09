'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Play, Pause } from 'lucide-react';
import { resolveVideoUrl } from '@/lib/video-url';

interface TrimModalProps {
  videoUrl: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  onSave: (trimStart: number, trimEnd: number) => void;
  onClose: () => void;
}

export function TrimModal({ videoUrl, duration, trimStart: initialStart, trimEnd: initialEnd, onSave, onClose }: TrimModalProps) {
  const [trimStart, setTrimStart] = useState(initialStart);
  const [trimEnd, setTrimEnd] = useState(initialEnd);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialStart);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const effectiveDuration = trimEnd - trimStart;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Sync video playback with trim range
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (playing) {
      video.currentTime = currentTime;
      video.play().catch(() => {});

      const update = () => {
        if (video.currentTime >= trimEnd) {
          video.pause();
          video.currentTime = trimStart;
          setCurrentTime(trimStart);
          setPlaying(false);
          return;
        }
        setCurrentTime(video.currentTime);
        animFrameRef.current = requestAnimationFrame(update);
      };
      animFrameRef.current = requestAnimationFrame(update);
    } else {
      video.pause();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [playing, trimStart, trimEnd]);

  // When trim start changes, seek video
  const handleTrimStartChange = useCallback((val: number) => {
    const clamped = Math.min(val, trimEnd - 0.1);
    setTrimStart(clamped);
    setCurrentTime(clamped);
    if (videoRef.current) videoRef.current.currentTime = clamped;
  }, [trimEnd]);

  const handleTrimEndChange = useCallback((val: number) => {
    const clamped = Math.max(val, trimStart + 0.1);
    setTrimEnd(clamped);
  }, [trimStart]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const time = x * duration;
    const clamped = Math.max(trimStart, Math.min(trimEnd, time));
    setCurrentTime(clamped);
    if (videoRef.current) videoRef.current.currentTime = clamped;
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1);
    return `${m}:${sec.padStart(4, '0')}`;
  };

  const handleSave = () => {
    onSave(Math.round(trimStart * 10) / 10, Math.round(trimEnd * 10) / 10);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">裁剪影片</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Preview */}
        <div className="bg-black flex items-center justify-center" style={{ height: 300 }}>
          <video
            ref={videoRef}
            src={resolveVideoUrl(videoUrl, 'playback')}
            className="max-w-full max-h-full object-contain"
            playsInline
            preload="auto"
            muted={false}
          />
        </div>

        {/* Timeline */}
        <div className="p-4 space-y-3">
          {/* Visual timeline */}
          <div
            className="relative h-10 bg-muted rounded cursor-pointer"
            onClick={handleTimelineClick}
          >
            {/* Active region */}
            <div
              className="absolute top-0 bottom-0 bg-primary/20 border-x-2 border-primary rounded"
              style={{
                left: `${(trimStart / duration) * 100}%`,
                width: `${((trimEnd - trimStart) / duration) * 100}%`,
              }}
            />
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-md z-10"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            />
          </div>

          {/* Trim controls */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">起點 (In)</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={trimStart}
                  onChange={(e) => handleTrimStartChange(parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="text-xs font-mono w-12 text-right">{formatTime(trimStart)}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">終點 (Out)</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={trimEnd}
                  onChange={(e) => handleTrimEndChange(parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="text-xs font-mono w-12 text-right">{formatTime(trimEnd)}</span>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>原始長度：{formatTime(duration)}</span>
            <span>裁剪後：{formatTime(effectiveDuration)}</span>
          </div>

          {/* Play/Pause */}
          <div className="flex justify-center">
            <button
              onClick={() => setPlaying(!playing)}
              className="p-3 bg-primary rounded-full text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setTrimStart(0);
              setTrimEnd(duration);
              setCurrentTime(0);
              if (videoRef.current) videoRef.current.currentTime = 0;
            }}
          >
            重設
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            套用裁剪
          </Button>
        </div>
      </div>
    </div>
  );
}
