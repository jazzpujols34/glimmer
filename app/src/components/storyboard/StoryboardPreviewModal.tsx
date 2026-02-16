'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Play, Pause, SkipBack } from 'lucide-react';
import type { Storyboard, StoryboardSlot } from '@/types';

interface StoryboardPreviewModalProps {
  storyboard: Storyboard;
  onClose: () => void;
}

type PlaylistItem =
  | { type: 'titleCard'; duration: number; text: string; subtitle?: string; bgColor: string; textColor: string }
  | { type: 'clip'; slot: StoryboardSlot; videoUrl: string }
  | { type: 'outroCard'; duration: number; text: string; subtitle?: string; bgColor: string; textColor: string };

export function StoryboardPreviewModal({ storyboard, onClose }: StoryboardPreviewModalProps) {
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const cardTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cardStartRef = useRef<number>(0);

  // Build playlist
  const playlist: PlaylistItem[] = [];

  // Add title card
  if (storyboard.titleCard) {
    playlist.push({
      type: 'titleCard',
      duration: storyboard.titleCard.durationSeconds,
      text: storyboard.titleCard.text,
      subtitle: storyboard.titleCard.subtitle,
      bgColor: storyboard.titleCard.backgroundColor,
      textColor: storyboard.titleCard.textColor,
    });
  }

  // Add filled slots
  const filledSlots = storyboard.slots
    .filter(s => s.status === 'filled' && s.clip)
    .sort((a, b) => a.index - b.index);

  for (const slot of filledSlots) {
    playlist.push({
      type: 'clip',
      slot,
      videoUrl: slot.clip!.videoUrl,
    });
  }

  // Add outro card
  if (storyboard.outroCard) {
    playlist.push({
      type: 'outroCard',
      duration: storyboard.outroCard.durationSeconds,
      text: storyboard.outroCard.text,
      subtitle: storyboard.outroCard.subtitle,
      bgColor: storyboard.outroCard.backgroundColor,
      textColor: storyboard.outroCard.textColor,
    });
  }

  const currentItem = playlist[currentIndex];
  const totalItems = playlist.length;

  // Calculate total duration for progress bar
  const totalDuration = playlist.reduce((sum, item) => {
    if (item.type === 'clip') {
      return sum + (item.slot.clip?.duration || 5);
    }
    return sum + item.duration;
  }, 0);

  // Transform video URL for playback
  const getPlayableUrl = (url: string): string => {
    if (url.startsWith('http')) return url;
    if (url.startsWith('local://')) return url.replace('local://', '');
    // R2 key - use proxy
    if (url.match(/videos\/([^/]+)\/(\d+)\.mp4/)) {
      const match = url.match(/videos\/([^/]+)\/(\d+)\.mp4/);
      if (match) {
        return `/api/proxy-video?jobId=${encodeURIComponent(match[1])}&index=${match[2]}`;
      }
    }
    return `/api/proxy-r2?key=${encodeURIComponent(url)}`;
  };

  // Get music URL
  const getMusicUrl = (): string | null => {
    if (!storyboard.music) return null;
    if (storyboard.music.type === 'bundled') {
      return `/audio/bundled/${storyboard.music.src}`;
    }
    // Uploaded - use proxy
    return `/api/proxy-r2?key=${encodeURIComponent(storyboard.music.src)}`;
  };

  const goToNext = useCallback(() => {
    if (currentIndex < totalItems - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // End of playlist
      setPlaying(false);
      setCurrentIndex(0);
    }
  }, [currentIndex, totalItems]);

  const playCard = useCallback((duration: number) => {
    cardStartRef.current = Date.now();
    cardTimerRef.current = setTimeout(() => {
      goToNext();
    }, duration * 1000);
  }, [goToNext]);

  const stopCardTimer = () => {
    if (cardTimerRef.current) {
      clearTimeout(cardTimerRef.current);
      cardTimerRef.current = null;
    }
  };

  // Handle playing state change
  useEffect(() => {
    if (!currentItem) return;

    if (playing) {
      if (currentItem.type === 'clip') {
        videoRef.current?.play();
      } else {
        playCard(currentItem.duration);
      }
      // Start music
      if (audioRef.current) {
        audioRef.current.play();
      }
    } else {
      if (currentItem.type === 'clip') {
        videoRef.current?.pause();
      } else {
        stopCardTimer();
      }
      // Pause music
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }
  }, [playing, currentItem, playCard]);

  // Handle index change
  useEffect(() => {
    if (!currentItem || !playing) return;

    stopCardTimer();

    if (currentItem.type === 'clip') {
      // Video will auto-play due to playing state
    } else {
      playCard(currentItem.duration);
    }
  }, [currentIndex, currentItem, playing, playCard]);

  // Handle video ended
  const handleVideoEnded = () => {
    goToNext();
  };

  // Update progress
  useEffect(() => {
    if (!playing) return;

    const interval = setInterval(() => {
      let elapsed = 0;

      // Sum duration of completed items
      for (let i = 0; i < currentIndex; i++) {
        const item = playlist[i];
        if (item.type === 'clip') {
          elapsed += item.slot.clip?.duration || 5;
        } else {
          elapsed += item.duration;
        }
      }

      // Add current item progress
      if (currentItem) {
        if (currentItem.type === 'clip' && videoRef.current) {
          elapsed += videoRef.current.currentTime;
        } else if (currentItem.type !== 'clip') {
          const cardElapsed = (Date.now() - cardStartRef.current) / 1000;
          elapsed += Math.min(cardElapsed, currentItem.duration);
        }
      }

      setProgress((elapsed / totalDuration) * 100);
    }, 100);

    return () => clearInterval(interval);
  }, [playing, currentIndex, currentItem, playlist, totalDuration]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopCardTimer();
    };
  }, []);

  const togglePlay = () => setPlaying(!playing);

  const restart = () => {
    setCurrentIndex(0);
    setProgress(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const musicUrl = getMusicUrl();

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-white text-sm">
          {storyboard.name} - 預覽
        </div>
        <button
          onClick={onClose}
          className="p-2 text-white/70 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center">
        {currentItem?.type === 'clip' ? (
          <video
            ref={videoRef}
            src={getPlayableUrl(currentItem.videoUrl)}
            className="max-w-full max-h-full object-contain"
            onEnded={handleVideoEnded}
            playsInline
          />
        ) : currentItem ? (
          <div
            className="w-full h-full flex flex-col items-center justify-center"
            style={{ backgroundColor: currentItem.bgColor }}
          >
            <h1
              className="text-4xl md:text-6xl font-bold text-center px-8"
              style={{ color: currentItem.textColor }}
            >
              {currentItem.text}
            </h1>
            {currentItem.subtitle && (
              <p
                className="text-xl md:text-2xl mt-4 text-center px-8"
                style={{ color: currentItem.textColor }}
              >
                {currentItem.subtitle}
              </p>
            )}
          </div>
        ) : (
          <div className="text-white text-center">
            <p className="text-lg mb-2">無法預覽</p>
            <p className="text-sm text-white/60">請先新增影片到故事板</p>
          </div>
        )}
      </div>

      {/* Music audio element */}
      {musicUrl && (
        <audio
          ref={audioRef}
          src={musicUrl}
          loop
          style={{ display: 'none' }}
        />
      )}

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/80 to-transparent">
        {/* Progress bar */}
        <div className="w-full h-1 bg-white/20 rounded-full mb-4">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={restart}
            className="p-2 text-white/70 hover:text-white transition-colors"
            title="重新開始"
          >
            <SkipBack className="w-6 h-6" />
          </button>

          <button
            onClick={togglePlay}
            className="p-4 bg-white rounded-full text-black hover:bg-white/90 transition-colors"
          >
            {playing ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </button>

          <div className="text-white/70 text-sm min-w-[80px] text-center">
            {currentIndex + 1} / {totalItems}
          </div>
        </div>
      </div>
    </div>
  );
}
