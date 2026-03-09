'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Play, Pause, SkipBack } from 'lucide-react';
import type { Storyboard, StoryboardSlot } from '@/types';
import { resolveVideoUrl } from '@/lib/video-url';
import { logger } from '@/lib/logger';

interface StoryboardPreviewModalProps {
  storyboard: Storyboard;
  onClose: () => void;
}

type PlaylistItem =
  | { type: 'titleCard'; duration: number; text: string; subtitle?: string; bgColor: string; textColor: string }
  | { type: 'clip'; slot: StoryboardSlot; videoUrl: string; duration: number }
  | { type: 'textCard'; duration: number; text: string; subtitle?: string; bgColor: string; textColor: string }
  | { type: 'outroCard'; duration: number; text: string; subtitle?: string; bgColor: string; textColor: string };

// Get transition duration in ms from storyboard transition type
function getTransitionDurationMs(transitionType?: string): number {
  if (!transitionType || transitionType === 'cut') return 0;
  if (transitionType === 'crossfade-500') return 500;
  if (transitionType === 'crossfade-1000') return 1000;
  return 500; // default
}

export function StoryboardPreviewModal({ storyboard, onClose }: StoryboardPreviewModalProps) {
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0); // Total elapsed time in seconds
  const [videoError, setVideoError] = useState(false);
  const [musicError, setMusicError] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0); // 0 to 1

  const videoRef = useRef<HTMLVideoElement>(null);
  const nextVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const cardTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const elapsedBeforePlayRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Handle Escape key to close modal
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

  // Build playlist
  const playlist: PlaylistItem[] = useMemo(() => {
    const items: PlaylistItem[] = [];

    // Add title card
    if (storyboard.titleCard) {
      items.push({
        type: 'titleCard',
        duration: storyboard.titleCard.durationSeconds,
        text: storyboard.titleCard.text,
        subtitle: storyboard.titleCard.subtitle,
        bgColor: storyboard.titleCard.backgroundColor,
        textColor: storyboard.titleCard.textColor,
      });
    }

    // Add content slots (clips + text cards) in order
    const contentSlots = storyboard.slots
      .filter(s => (s.status === 'filled' && s.clip) || (s.status === 'text-card' && s.textCard))
      .sort((a, b) => a.index - b.index);

    for (const slot of contentSlots) {
      if (slot.status === 'text-card' && slot.textCard) {
        items.push({
          type: 'textCard',
          duration: slot.textCard.durationSeconds,
          text: slot.textCard.text,
          subtitle: slot.textCard.subtitle,
          bgColor: slot.textCard.backgroundColor,
          textColor: slot.textCard.textColor,
        });
      } else if (slot.status === 'filled' && slot.clip) {
        items.push({
          type: 'clip',
          slot,
          videoUrl: slot.clip.videoUrl,
          duration: slot.clip.duration || 5,
        });
      }
    }

    // Add outro card
    if (storyboard.outroCard) {
      items.push({
        type: 'outroCard',
        duration: storyboard.outroCard.durationSeconds,
        text: storyboard.outroCard.text,
        subtitle: storyboard.outroCard.subtitle,
        bgColor: storyboard.outroCard.backgroundColor,
        textColor: storyboard.outroCard.textColor,
      });
    }

    return items;
  }, [storyboard]);

  const currentItem = playlist[currentIndex];
  const nextItem = playlist[currentIndex + 1];
  const totalItems = playlist.length;

  // Calculate total duration
  const totalDuration = useMemo(() => {
    return playlist.reduce((sum, item) => sum + item.duration, 0);
  }, [playlist]);

  // Get cumulative time at start of each index
  const cumulativeTimes = useMemo(() => {
    const times: number[] = [0];
    for (let i = 0; i < playlist.length - 1; i++) {
      times.push(times[i] + playlist[i].duration);
    }
    return times;
  }, [playlist]);

  // Get transition duration for transition AFTER current item
  const currentTransitionMs = useMemo(() => {
    if (currentItem?.type === 'clip') {
      // Find the clip's index among clips only
      const clipIndex = playlist.slice(0, currentIndex + 1).filter(i => i.type === 'clip').length - 1;
      const transitionType = storyboard.transitions[clipIndex];
      return getTransitionDurationMs(transitionType);
    }
    // Title/outro cards always use a smooth fade
    return 500;
  }, [currentIndex, currentItem, playlist, storyboard.transitions]);

  // Get music URL
  const getMusicUrl = (): string | null => {
    if (!storyboard.music) return null;
    if (storyboard.music.type === 'bundled') {
      return `/audio/bundled/${storyboard.music.src}`;
    }
    return `/api/proxy-r2?key=${encodeURIComponent(storyboard.music.src)}`;
  };

  const stopAllTimers = useCallback(() => {
    if (cardTimerRef.current) {
      clearTimeout(cardTimerRef.current);
      cardTimerRef.current = null;
    }
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Skip to next item (for error cases / immediate cuts)
  const skipToNext = useCallback(() => {
    setTransitioning(false);
    setTransitionProgress(0);
    if (currentIndex < totalItems - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // End of playlist
      setPlaying(false);
      setCurrentIndex(0);
      setElapsedTime(0);
      elapsedBeforePlayRef.current = 0;
    }
  }, [currentIndex, totalItems]);

  // Start transition to next item
  const startTransition = useCallback(() => {
    // Prevent starting transition if already transitioning
    if (transitioning) return;

    if (currentTransitionMs === 0) {
      // Immediate cut
      skipToNext();
      return;
    }

    setTransitioning(true);
    setTransitionProgress(0);

    // Also start next video if it's a clip
    if (nextItem?.type === 'clip' && nextVideoRef.current) {
      nextVideoRef.current.currentTime = 0;
      nextVideoRef.current.play().catch(() => {});
    }

    // Animate transition progress using only requestAnimationFrame
    const startTime = performance.now();
    const duration = currentTransitionMs;

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setTransitionProgress(progress);

      if (progress < 1) {
        transitionTimerRef.current = requestAnimationFrame(animate) as unknown as NodeJS.Timeout;
      } else {
        // Transition complete
        setTransitioning(false);
        setTransitionProgress(0);
        setCurrentIndex(prev => {
          if (prev < totalItems - 1) {
            return prev + 1;
          } else {
            // End of playlist
            setPlaying(false);
            setElapsedTime(0);
            elapsedBeforePlayRef.current = 0;
            return 0;
          }
        });
      }
    };

    transitionTimerRef.current = requestAnimationFrame(animate) as unknown as NodeJS.Timeout;
  }, [currentTransitionMs, nextItem, transitioning, totalItems, skipToNext]);

  // Play card with timer
  const playCard = useCallback((duration: number) => {
    cardTimerRef.current = setTimeout(() => {
      startTransition();
    }, duration * 1000);
  }, [startTransition]);

  // Handle video ended
  const handleVideoEnded = useCallback(() => {
    startTransition();
  }, [startTransition]);

  // Update elapsed time using requestAnimationFrame for smooth progress
  useEffect(() => {
    if (!playing) return;

    // Capture current elapsed time when starting to play
    const startElapsed = elapsedBeforePlayRef.current;
    const startTime = performance.now();

    const updateElapsed = () => {
      const now = performance.now();
      const playingTime = (now - startTime) / 1000;
      const newElapsed = startElapsed + playingTime;
      setElapsedTime(newElapsed);
      elapsedBeforePlayRef.current = newElapsed; // Keep ref in sync for pause
      animationFrameRef.current = requestAnimationFrame(updateElapsed);
    };

    animationFrameRef.current = requestAnimationFrame(updateElapsed);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [playing]); // Only depend on playing, not elapsedTime

  // Handle playing state change
  useEffect(() => {
    if (!currentItem) return;

    if (playing) {
      if (currentItem.type === 'clip') {
        videoRef.current?.play().catch(() => {
          logger.warn('Video autoplay blocked');
        });
      } else {
        playCard(currentItem.duration);
      }
      // Start music
      if (audioRef.current && !musicError) {
        audioRef.current.play().catch(() => {});
      }
    } else {
      if (currentItem.type === 'clip') {
        videoRef.current?.pause();
      }
      stopAllTimers();
      // Pause music
      audioRef.current?.pause();
    }
  }, [playing, currentItem, playCard, musicError, stopAllTimers]);

  // Handle index change
  useEffect(() => {
    setVideoError(false);

    // Update elapsed time to match current position
    elapsedBeforePlayRef.current = cumulativeTimes[currentIndex] || 0;
    setElapsedTime(elapsedBeforePlayRef.current);
    playStartTimeRef.current = performance.now();

    if (!currentItem || !playing) return;

    stopAllTimers();

    if (currentItem.type === 'clip') {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
    } else {
      playCard(currentItem.duration);
    }
  }, [currentIndex, currentItem, playing, playCard, stopAllTimers, cumulativeTimes]);

  // Cleanup
  useEffect(() => {
    return () => stopAllTimers();
  }, [stopAllTimers]);

  const togglePlay = () => setPlaying(!playing);

  const restart = () => {
    stopAllTimers();
    setCurrentIndex(0);
    setElapsedTime(0);
    elapsedBeforePlayRef.current = 0;
    setTransitioning(false);
    setTransitionProgress(0);
    if (videoRef.current) videoRef.current.currentTime = 0;
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const musicUrl = getMusicUrl();
  const progress = totalDuration > 0 ? (elapsedTime / totalDuration) * 100 : 0;

  // Render a card (title or outro)
  const renderCard = (item: PlaylistItem, opacity: number = 1) => {
    if (item.type === 'clip') return null;
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ backgroundColor: item.bgColor, opacity }}
      >
        <h1
          className="text-4xl md:text-6xl font-bold text-center px-8"
          style={{ color: item.textColor }}
        >
          {item.text}
        </h1>
        {item.subtitle && (
          <p
            className="text-xl md:text-2xl mt-4 text-center px-8"
            style={{ color: item.textColor }}
          >
            {item.subtitle}
          </p>
        )}
      </div>
    );
  };

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
          aria-label="關閉預覽"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {/* Current item */}
        {currentItem?.type === 'clip' ? (
          videoError ? (
            <div className="text-white text-center z-10">
              <svg className="w-16 h-16 mx-auto mb-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-lg mb-2">影片已過期或無法存取</p>
              <button
                onClick={() => {
                  setVideoError(false);
                  skipToNext();
                }}
                className="text-sm text-white/70 hover:text-white underline"
              >
                跳過此片段
              </button>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={resolveVideoUrl(currentItem.videoUrl, 'playback')}
              className="max-w-full max-h-full object-contain absolute"
              style={{ opacity: transitioning ? 1 - transitionProgress : 1 }}
              onEnded={handleVideoEnded}
              onError={() => setVideoError(true)}
              playsInline
              preload="auto"
            />
          )
        ) : currentItem ? (
          renderCard(currentItem, transitioning ? 1 - transitionProgress : 1)
        ) : (
          <div className="text-white text-center">
            <p className="text-lg mb-2">無法預覽</p>
            <p className="text-sm text-white/60">請先新增影片到故事板</p>
          </div>
        )}

        {/* Next item (during transition) */}
        {transitioning && nextItem && (
          nextItem.type === 'clip' ? (
            <video
              ref={nextVideoRef}
              src={resolveVideoUrl(nextItem.videoUrl, 'playback')}
              className="max-w-full max-h-full object-contain absolute"
              style={{ opacity: transitionProgress }}
              playsInline
              preload="auto"
              muted // Will unmute after becoming current
            />
          ) : (
            renderCard(nextItem, transitionProgress)
          )
        )}

        {/* Preload next video (hidden) */}
        {!transitioning && nextItem?.type === 'clip' && (
          <video
            ref={nextVideoRef}
            src={resolveVideoUrl(nextItem.videoUrl, 'playback')}
            className="hidden"
            preload="auto"
            muted
          />
        )}
      </div>

      {/* Music audio element */}
      {musicUrl && (
        <audio
          ref={audioRef}
          src={musicUrl}
          loop
          style={{ display: 'none' }}
          onError={() => setMusicError(true)}
        />
      )}

      {/* Music error indicator */}
      {musicError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-yellow-500/90 text-black px-3 py-1 rounded-full text-xs flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
          音樂載入失敗
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/80 to-transparent">
        {/* Progress bar - no transition for smooth updates */}
        <div className="w-full h-1 bg-white/20 rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={restart}
            className="p-2 text-white/70 hover:text-white transition-colors"
            title="重新開始"
            aria-label="重新開始預覽"
          >
            <SkipBack className="w-6 h-6" />
          </button>

          <button
            onClick={togglePlay}
            className="p-4 bg-white rounded-full text-black hover:bg-white/90 transition-colors"
            aria-label={playing ? '暫停' : '播放'}
          >
            {playing ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </button>

          <div className="text-white/70 text-sm min-w-[80px] text-center" aria-live="polite">
            {currentIndex + 1} / {totalItems}
          </div>
        </div>
      </div>
    </div>
  );
}
