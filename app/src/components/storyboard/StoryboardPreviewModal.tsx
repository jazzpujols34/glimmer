'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Play, Pause, SkipBack } from 'lucide-react';
import type { Storyboard, StoryboardSlot } from '@/types';
import { resolveVideoUrl } from '@/lib/video-url';
import { logger } from '@/lib/logger';
import { getCardTemplate } from '@/lib/card-templates';

interface StoryboardPreviewModalProps {
  storyboard: Storyboard;
  onClose: () => void;
}

type PlaylistItem =
  | { type: 'titleCard'; duration: number; text: string; subtitle?: string; bgColor: string; textColor: string; templateId?: string }
  | { type: 'clip'; slot: StoryboardSlot; videoUrl: string; duration: number }
  | { type: 'textCard'; duration: number; text: string; subtitle?: string; bgColor: string; textColor: string; templateId?: string }
  | { type: 'outroCard'; duration: number; text: string; subtitle?: string; bgColor: string; textColor: string; templateId?: string };

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
  const audioRef = useRef<HTMLAudioElement>(null); // legacy single ref, kept for first track
  const audioRefsMap = useRef<Map<string, HTMLAudioElement>>(new Map());
  const cardTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const elapsedBeforePlayRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const userSeekingRef = useRef(false); // true during explicit seek/restart — allows backward music seek

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
        templateId: storyboard.titleCard.templateId,
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
          templateId: slot.textCard.templateId,
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
        templateId: storyboard.outroCard.templateId,
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

  // Build music track URLs (multi-track or legacy)
  const musicTracksResolved = useMemo(() => {
    const tracks = storyboard.musicTracks || (
      storyboard.music ? [{
        id: 'legacy_0',
        type: storyboard.music.type,
        src: storyboard.music.src,
        name: storyboard.music.name,
        volume: storyboard.music.volume,
        timelinePosition: 0,
        trimStart: 0,
        trimEnd: totalDuration || 60,
      }] : []
    );
    return tracks.map(t => ({
      ...t,
      url: t.type === 'bundled'
        ? `/audio/bundled/${t.src}`
        : `/api/proxy-r2?key=${encodeURIComponent(t.src)}`,
    }));
  }, [storyboard.music, storyboard.musicTracks, totalDuration]);

  // Get active subtitles for the current elapsed time
  const activeSubtitles = useMemo(() => {
    if (!storyboard.subtitles) return [];
    return storyboard.subtitles.filter(
      sub => elapsedTime >= sub.startTime && elapsedTime < sub.endTime
    );
  }, [storyboard.subtitles, elapsedTime]);

  // Stop only card/transition timers (preserves the elapsed-time animation loop)
  const stopPlaybackTimers = useCallback(() => {
    if (cardTimerRef.current) {
      clearTimeout(cardTimerRef.current);
      cardTimerRef.current = null;
    }
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  // Full stop: also kills the elapsed-time animation frame (used for pause/seek/restart)
  const stopAllTimers = useCallback(() => {
    stopPlaybackTimers();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [stopPlaybackTimers]);

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

  // Music helpers: sync tracks to current timeline position
  // Each track plays only when elapsed time is within [timelinePosition, timelinePosition + (trimEnd - trimStart)]
  const syncMusicToTime = useCallback((time: number, shouldPlay: boolean) => {
    for (const track of musicTracksResolved) {
      const audio = audioRefsMap.current.get(track.id);
      if (!audio) continue;

      const trackDuration = track.trimEnd - track.trimStart;
      const trackEnd = track.timelinePosition + trackDuration;
      const offsetInTrack = time - track.timelinePosition;

      if (shouldPlay && offsetInTrack >= 0 && time < trackEnd) {
        // Track should be active — sync position and play
        const expectedTime = track.trimStart + offsetInTrack;
        const drift = expectedTime - audio.currentTime; // positive = audio behind, negative = audio ahead

        // During normal playback: only seek forward (audio behind by >0.3s)
        // During explicit seek/restart: seek in either direction
        // Safety: always correct if audio drifts >2s ahead (something went wrong)
        if (drift > 0.3 || (userSeekingRef.current && Math.abs(drift) > 0.1) || drift < -2.0) {
          audio.currentTime = expectedTime;
        }
        if (audio.paused) audio.play().catch(() => {});
      } else {
        // Track should not be playing
        if (!audio.paused) audio.pause();
        if (offsetInTrack < 0) {
          audio.currentTime = track.trimStart;
        }
      }
    }
  }, [musicTracksResolved]);

  const pauseAllMusic = useCallback(() => {
    audioRefsMap.current.forEach((audio) => audio.pause());
  }, []);

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
      elapsedBeforePlayRef.current = newElapsed;
      // Sync music tracks to current time (start/stop based on timeline position)
      syncMusicToTime(newElapsed, true);
      animationFrameRef.current = requestAnimationFrame(updateElapsed);
    };

    animationFrameRef.current = requestAnimationFrame(updateElapsed);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [playing, syncMusicToTime]);

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
      // Sync music (will start only tracks whose timeline position is active)
      if (!musicError) syncMusicToTime(elapsedBeforePlayRef.current, true);
    } else {
      if (currentItem.type === 'clip') {
        videoRef.current?.pause();
      }
      stopAllTimers();
      pauseAllMusic();
    }
  }, [playing, currentItem, playCard, musicError, stopAllTimers, syncMusicToTime, pauseAllMusic]);

  // Handle index change — only start new item, don't reset elapsed time
  // (elapsed time flows continuously via the animation frame loop)
  useEffect(() => {
    setVideoError(false);

    if (!currentItem || !playing) return;

    // Only stop card/transition timers, NOT the animation frame loop
    stopPlaybackTimers();

    if (currentItem.type === 'clip') {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
    } else {
      playCard(currentItem.duration);
    }
  }, [currentIndex, currentItem, playing, playCard, stopPlaybackTimers]);

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
    userSeekingRef.current = true;
    syncMusicToTime(0, false);
    userSeekingRef.current = false;
  };

  const seekTo = useCallback((targetTime: number) => {
    const clamped = Math.max(0, Math.min(targetTime, totalDuration));

    // Find which playlist item this time falls into
    let targetIndex = 0;
    for (let i = 0; i < playlist.length; i++) {
      if (i === playlist.length - 1 || clamped < cumulativeTimes[i + 1]) {
        targetIndex = i;
        break;
      }
    }

    const offsetInItem = clamped - cumulativeTimes[targetIndex];

    stopAllTimers();
    setTransitioning(false);
    setTransitionProgress(0);
    setElapsedTime(clamped);
    elapsedBeforePlayRef.current = clamped;

    // If seeking to a different item, change index (triggers useEffect)
    if (targetIndex !== currentIndex) {
      setCurrentIndex(targetIndex);
    }

    // Seek within clip if it's a video
    const item = playlist[targetIndex];
    if (item?.type === 'clip' && videoRef.current) {
      videoRef.current.currentTime = offsetInItem;
      if (playing) videoRef.current.play().catch(() => {});
    } else if (item && item.type !== 'clip' && playing) {
      // Card: set timer for remaining duration
      const remaining = item.duration - offsetInItem;
      if (remaining > 0) {
        cardTimerRef.current = setTimeout(() => startTransition(), remaining * 1000);
      } else {
        startTransition();
      }
    }

    // Sync music to new position (allow backward seek since user explicitly seeked)
    userSeekingRef.current = true;
    syncMusicToTime(clamped, playing);
    userSeekingRef.current = false;
  }, [totalDuration, playlist, cumulativeTimes, currentIndex, playing, stopAllTimers, startTransition, syncMusicToTime]);

  const handleProgressBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const targetTime = x * totalDuration;
    seekTo(targetTime);
  }, [totalDuration, seekTo]);

  const progress = totalDuration > 0 ? (elapsedTime / totalDuration) * 100 : 0;

  // Render a card (title, outro, or text card) using its template layout
  const renderCard = (item: PlaylistItem, opacity: number = 1) => {
    if (item.type === 'clip') return null;
    const template = getCardTemplate(item.templateId);

    const renderDivider = () => {
      if (!template.preview.divider || !item.subtitle) return null;
      const color = item.textColor;
      if (template.preview.divider === 'line') {
        return <div className="w-12 my-3 border-t-2" style={{ borderColor: `${color}40` }} />;
      }
      if (template.preview.divider === 'dot') {
        return (
          <div className="flex gap-1.5 my-4" style={{ color: `${color}60` }}>
            <span>·</span><span>·</span><span>·</span>
          </div>
        );
      }
      if (template.preview.divider === 'dash') {
        return <div className="w-8 my-4 border-t" style={{ borderColor: `${color}50` }} />;
      }
      return null;
    };

    return (
      <div
        className="absolute inset-0"
        style={{ backgroundColor: item.bgColor, opacity }}
      >
        <div className={`absolute inset-0 ${template.preview.container}`}>
          <h1 className={template.preview.title} style={{ color: item.textColor }}>
            {item.text}
          </h1>
          {renderDivider()}
          {item.subtitle && (
            <p className={template.preview.subtitle} style={{ color: item.textColor }}>
              {item.subtitle}
            </p>
          )}
        </div>
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

        {/* Subtitle overlay */}
        {activeSubtitles.length > 0 && (
          <div className="absolute inset-0 pointer-events-none flex flex-col z-20">
            {activeSubtitles.map((sub) => (
              <div
                key={sub.id}
                className={`absolute left-0 right-0 flex justify-center px-8 ${
                  sub.position === 'top' ? 'top-8' : sub.position === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-16'
                }`}
              >
                <span className="bg-black/70 text-white px-4 py-2 rounded-lg text-lg md:text-2xl text-center max-w-[80%]">
                  {sub.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Music audio elements (multi-track) */}
      {musicTracksResolved.map((track) => (
        <audio
          key={track.id}
          ref={(el) => {
            if (el) {
              audioRefsMap.current.set(track.id, el);
              el.volume = track.volume;
            } else {
              audioRefsMap.current.delete(track.id);
            }
          }}
          src={track.url}
          style={{ display: 'none' }}
          onError={() => setMusicError(true)}
        />
      ))}

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
        {/* Progress bar — clickable to seek */}
        <div
          className="w-full h-2 bg-white/20 rounded-full mb-4 overflow-hidden cursor-pointer group hover:h-3 transition-all"
          onClick={handleProgressBarClick}
        >
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
