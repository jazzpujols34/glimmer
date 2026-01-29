'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEditor, useEditorDispatch } from './EditorContext';
import {
  getClipDuration,
  getActiveSubtitles,
  getActiveElementAtPosition,
  getOutroStart,
} from '@/lib/editor/timeline-utils';
import { CANVAS_FILTERS } from '@/lib/editor/filter-maps';
import type { SubtitleSegment } from '@/types/editor';

/**
 * VideoPreview — real <video> element with hybrid playhead sync.
 *
 * Clip regions:  playhead derived from video.currentTime (source of truth).
 * Card regions:  playhead advanced by wall-clock timer.
 * Gap regions:   playhead advanced by wall-clock timer, show black frame.
 *
 * A "loading" guard prevents stale video.currentTime reads during clip
 * transitions — the playhead freezes momentarily until the new clip is ready.
 */
export function VideoPreview() {
  const state = useEditor();
  const dispatch = useEditorDispatch();

  const videoRef = useRef<HTMLVideoElement>(null);
  const musicAudioMapRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const sfxAudioMapRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Refs for the playback engine (avoids stale closure issues)
  const stateRef = useRef(state);
  const playingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const currentClipIndexRef = useRef(-1);
  const playheadRef = useRef(0);

  // Guard: true while switching clip src — prevents stale currentTime reads
  const loadingClipRef = useRef(false);

  // Wall-clock refs for title / outro / gap regions (no video to read from)
  const cardWallStartRef = useRef(0);
  const cardPlayheadStartRef = useRef(0);

  // Keep stateRef in sync
  stateRef.current = state;

  // Active subtitles for overlay
  const activeSubtitles = getActiveSubtitles(state.playheadPosition, state.subtitles);

  // Determine what's at current playhead
  const activeElement = getActiveElementAtPosition(state.playheadPosition, state);
  const isInGap = activeElement.kind === 'gap';

  // ── Resolve which clip & local time from a global playhead position ──
  const resolvePlayhead = useCallback(
    (globalPos: number): { clipIndex: number; localTime: number } | null => {
      const s = stateRef.current;
      const active = getActiveElementAtPosition(globalPos, s);

      if (active.kind === 'clip' && active.clipIndex !== undefined && active.localTime !== undefined) {
        return { clipIndex: active.clipIndex, localTime: active.localTime };
      }

      return null; // title-card, outro, gap, or beyond
    },
    [],
  );

  // ── Load a clip into the <video> element (does NOT call play) ──
  const loadClip = useCallback((clipIndex: number, seekTo?: number) => {
    const video = videoRef.current;
    const s = stateRef.current;
    if (!video || clipIndex < 0 || clipIndex >= s.clips.length) return;

    const clip = s.clips[clipIndex];
    currentClipIndexRef.current = clipIndex;

    video.playbackRate = clip.speed;
    video.volume = clip.volume;

    if (clip.filter && CANVAS_FILTERS[clip.filter]) {
      video.style.filter = CANVAS_FILTERS[clip.filter];
    } else {
      video.style.filter = 'none';
    }

    const targetTime = seekTo ?? clip.trimStart;

    if (video.src !== clip.blobUrl) {
      // Different source — need to load; set guard
      loadingClipRef.current = true;
      video.src = clip.blobUrl;
      const onReady = () => {
        video.currentTime = targetTime;
        loadingClipRef.current = false;
        video.removeEventListener('loadeddata', onReady);
      };
      video.addEventListener('loadeddata', onReady);
      video.load();
    } else if (video.readyState >= 2) {
      video.currentTime = targetTime;
    } else {
      loadingClipRef.current = true;
      const onReady = () => {
        video.currentTime = targetTime;
        loadingClipRef.current = false;
        video.removeEventListener('loadeddata', onReady);
      };
      video.addEventListener('loadeddata', onReady);
    }
  }, []);

  // ── Helper: start video playback (handles readyState) ──
  const playVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.readyState >= 2) {
      video.play().catch(() => {});
    } else {
      const doPlay = () => {
        video.play().catch(() => {});
        video.removeEventListener('loadeddata', doPlay);
        video.removeEventListener('canplay', doPlay);
      };
      video.addEventListener('loadeddata', doPlay, { once: true });
      video.addEventListener('canplay', doPlay, { once: true });
    }
  }, []);

  // ── SEEK: when user clicks/scrubs timeline (paused) ──
  useEffect(() => {
    if (playingRef.current) return;
    const result = resolvePlayhead(state.playheadPosition);
    if (result) {
      loadClip(result.clipIndex, result.localTime);
    }
    playheadRef.current = state.playheadPosition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.playheadPosition, state.clips.length]);

  // ── PLAY / PAUSE ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (state.isPlaying) {
      playingRef.current = true;

      const s = stateRef.current;
      const pos = playheadRef.current;
      const active = getActiveElementAtPosition(pos, s);

      if (active.kind === 'title' || active.kind === 'outro' || active.kind === 'gap') {
        // Wall-clock driven region
        cardWallStartRef.current = performance.now();
        cardPlayheadStartRef.current = pos;
        if (!video.paused) video.pause();
      } else if (active.kind === 'clip' && active.clipIndex !== undefined) {
        // Clip region — load and play
        loadClip(active.clipIndex, active.localTime);
        playVideo();
      }

      // Start active music clips
      const musicMap = musicAudioMapRef.current;
      const musicMuted = s.trackStates.music.muted;
      for (const mc of s.musicClips) {
        const mcEnd = mc.timelinePosition + (mc.trimEnd - mc.trimStart);
        if (pos >= mc.timelinePosition && pos < mcEnd) {
          let el = musicMap.get(mc.id);
          if (!el) {
            el = new Audio(mc.blobUrl);
            musicMap.set(mc.id, el);
          }
          el.volume = musicMuted ? 0 : mc.volume;
          el.currentTime = mc.trimStart + (pos - mc.timelinePosition);
          el.play().catch(() => {});
        }
      }

      startSyncLoop();
    } else {
      playingRef.current = false;
      video.pause();
      musicAudioMapRef.current.forEach((el) => el.pause());
      sfxAudioMapRef.current.forEach((el) => el.pause());
      stopSyncLoop();
    }

    return () => {
      stopSyncLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isPlaying]);

  // ══════════════════════════════════════════════════════════════════════
  //  SYNC LOOP — runs at display refresh-rate while playing
  // ══════════════════════════════════════════════════════════════════════
  const startSyncLoop = useCallback(() => {
    stopSyncLoop();
    let lastDispatch = 0;

    const tick = () => {
      const s = stateRef.current;
      if (!playingRef.current) return;

      const video = videoRef.current;
      let globalPos = playheadRef.current;

      const active = getActiveElementAtPosition(globalPos, s);

      // ── TITLE / OUTRO / GAP ── wall-clock driven
      if (active.kind === 'title' || active.kind === 'outro' || active.kind === 'gap') {
        const wallElapsed = (performance.now() - cardWallStartRef.current) / 1000;
        globalPos = cardPlayheadStartRef.current + wallElapsed;

        if (video && !video.paused) video.pause();

        // Check if we've transitioned into a new region
        const newActive = getActiveElementAtPosition(globalPos, s);

        if (newActive.kind === 'clip' && newActive.clipIndex !== undefined) {
          // Transition from gap/card to clip
          loadClip(newActive.clipIndex, newActive.localTime);
          playVideo();
        } else if (newActive.kind === 'none' || globalPos >= s.totalDuration) {
          // Reached the end
          stopAndReset();
          return;
        } else if (newActive.kind !== active.kind) {
          // Transitioning between card/gap types — keep wall-clock running
          // (e.g., title → gap, gap → outro)
        }

      // ── CLIP REGION ── video.currentTime is the source of truth
      } else if (active.kind === 'clip' && video) {
        if (loadingClipRef.current) {
          rafIdRef.current = requestAnimationFrame(tick);
          return;
        }

        const clipIndex = currentClipIndexRef.current;
        const clip = s.clips[clipIndex];
        if (!clip) {
          stopAndReset();
          return;
        }

        const currentTime = video.currentTime;
        const clipStart = clip.timelinePosition;

        // Derive global playhead from native video time
        const elapsed = (currentTime - clip.trimStart) / clip.speed;
        globalPos = clipStart + elapsed;
        globalPos = Math.max(0, Math.min(globalPos, s.totalDuration));

        // Check if clip has finished (reached trimEnd)
        if (currentTime >= clip.trimEnd - 0.05) {
          video.pause();

          // Find next content after this clip ends
          const clipEnd = clip.timelinePosition + getClipDuration(clip);
          const nextActive = getActiveElementAtPosition(clipEnd, s);

          if (nextActive.kind === 'clip' && nextActive.clipIndex !== undefined) {
            // Next clip starts immediately
            loadClip(nextActive.clipIndex);
            playVideo();
          } else if (nextActive.kind === 'gap' || nextActive.kind === 'outro') {
            // Enter gap or outro — switch to wall-clock
            globalPos = clipEnd;
            cardWallStartRef.current = performance.now();
            cardPlayheadStartRef.current = clipEnd;
          } else {
            // End of timeline
            stopAndReset();
            return;
          }
        }
      }

      playheadRef.current = globalPos;

      // ── SFX playback sync ──
      const sfxMap = sfxAudioMapRef.current;
      const sfxItems = s.sfx;
      const sfxMuted = s.trackStates.sfx.muted;
      const activeSfxIds = new Set<string>();

      for (const sfxItem of sfxItems) {
        const sfxEnd = sfxItem.startTime + sfxItem.duration;
        if (globalPos >= sfxItem.startTime && globalPos < sfxEnd) {
          activeSfxIds.add(sfxItem.id);
          let el = sfxMap.get(sfxItem.id);
          if (!el) {
            el = new Audio(sfxItem.blobUrl);
            sfxMap.set(sfxItem.id, el);
          }
          el.volume = sfxMuted ? 0 : sfxItem.volume;
          if (el.paused) {
            el.currentTime = globalPos - sfxItem.startTime;
            el.play().catch(() => {});
          }
        }
      }

      // Pause SFX that are no longer active
      sfxMap.forEach((el, id) => {
        if (!activeSfxIds.has(id) && !el.paused) {
          el.pause();
        }
      });

      // ── Music clip playback sync ──
      const musicMap = musicAudioMapRef.current;
      const musicMuted = s.trackStates.music.muted;
      const activeMusicIds = new Set<string>();

      for (const mc of s.musicClips) {
        const mcEnd = mc.timelinePosition + (mc.trimEnd - mc.trimStart);
        if (globalPos >= mc.timelinePosition && globalPos < mcEnd) {
          activeMusicIds.add(mc.id);
          let el = musicMap.get(mc.id);
          if (!el) {
            el = new Audio(mc.blobUrl);
            musicMap.set(mc.id, el);
          }
          el.volume = musicMuted ? 0 : mc.volume;
          if (el.paused) {
            el.currentTime = mc.trimStart + (globalPos - mc.timelinePosition);
            el.play().catch(() => {});
          }
        }
      }

      // Pause music clips that are no longer active
      musicMap.forEach((el, id) => {
        if (!activeMusicIds.has(id) && !el.paused) {
          el.pause();
        }
      });

      // Throttle React dispatches to ~15 fps
      const now = performance.now();
      if (now - lastDispatch > 66) {
        dispatch({ type: 'SET_PLAYHEAD', payload: globalPos });
        lastDispatch = now;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, loadClip, resolvePlayhead, playVideo]);

  const stopSyncLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const stopAndReset = useCallback(() => {
    playingRef.current = false;
    const video = videoRef.current;
    if (video) video.pause();
    musicAudioMapRef.current.forEach((el) => el.pause());
    sfxAudioMapRef.current.forEach((el) => el.pause());
    stopSyncLoop();
    dispatch({ type: 'SET_PLAYING', payload: false });
    dispatch({ type: 'SET_PLAYHEAD', payload: 0 });
    playheadRef.current = 0;
  }, [dispatch, stopSyncLoop]);

  // ── Clip property changes (speed, volume, filter) while paused ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playingRef.current) return;

    const clipIndex = currentClipIndexRef.current;
    if (clipIndex < 0) return;
    const clip = state.clips[clipIndex];
    if (!clip) return;

    video.playbackRate = clip.speed;
    video.volume = clip.volume;
    if (clip.filter && CANVAS_FILTERS[clip.filter]) {
      video.style.filter = CANVAS_FILTERS[clip.filter];
    } else {
      video.style.filter = 'none';
    }
  }, [state.clips]);

  // ── Music clips: sync audio element map ──
  useEffect(() => {
    const map = musicAudioMapRef.current;
    const currentIds = new Set(state.musicClips.map(mc => mc.id));

    // Remove elements for deleted clips
    map.forEach((el, id) => {
      if (!currentIds.has(id)) {
        el.pause();
        el.src = '';
        map.delete(id);
      }
    });

    // Update volume for existing clips
    const musicMuted = state.trackStates.music.muted;
    for (const mc of state.musicClips) {
      const el = map.get(mc.id);
      if (el) {
        el.volume = musicMuted ? 0 : mc.volume;
      }
    }
  }, [state.musicClips, state.trackStates.music.muted]);

  // ── Title/Outro/Gap card display ──
  const showTitleCard =
    state.titleCard && state.playheadPosition < state.titleCard.durationSeconds;
  const showOutroCard =
    state.outroCard &&
    state.playheadPosition >= getOutroStart(state) &&
    state.playheadPosition > 0;
  const activeCard = showTitleCard
    ? state.titleCard
    : showOutroCard
      ? state.outroCard
      : null;

  // Hide video when in a gap or showing a card
  const hideVideo = !!activeCard || isInGap;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center bg-black relative select-none"
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="max-w-full max-h-full object-contain"
        style={{ display: hideVideo ? 'none' : 'block' }}
        muted={state.trackStates.video.muted}
        playsInline
      />

      {/* Title/Outro card overlay */}
      {activeCard && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            backgroundColor: activeCard.backgroundColor,
            color: activeCard.textColor,
          }}
        >
          <p className="text-3xl font-bold">{activeCard.text}</p>
          {activeCard.subtitle && (
            <p className="text-lg mt-2">{activeCard.subtitle}</p>
          )}
        </div>
      )}

      {/* Gap indicator — black screen is default bg, just show text hint */}
      {isInGap && !activeCard && (
        <div className="absolute text-white/30 text-xs">空白</div>
      )}

      {/* Subtitle overlays */}
      {!activeCard &&
        !isInGap &&
        state.trackStates.subtitle.visible &&
        activeSubtitles.map((sub) => (
          <DraggableSubtitle
            key={sub.id}
            subtitle={sub}
            containerRef={containerRef}
          />
        ))}

      {state.clips.length === 0 && (
        <div className="absolute text-white/50 text-sm">沒有影片片段</div>
      )}
    </div>
  );
}

// ── Draggable subtitle overlay ──

function DraggableSubtitle({
  subtitle,
  containerRef,
}: {
  subtitle: SubtitleSegment;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const dispatch = useEditorDispatch();
  const elRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  const hasCustomPos = subtitle.x !== undefined && subtitle.y !== undefined;
  const posStyle: React.CSSProperties = hasCustomPos
    ? {
        left: `${(subtitle.x ?? 0.5) * 100}%`,
        top: `${(subtitle.y ?? 0.88) * 100}%`,
        transform: 'translate(-50%, -50%)',
      }
    : {
        left: '50%',
        top:
          subtitle.position === 'top'
            ? '12%'
            : subtitle.position === 'center'
              ? '50%'
              : '88%',
        transform: 'translate(-50%, -50%)',
      };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    const el = elRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      offsetRef.current = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left - offsetRef.current.x) / rect.width),
    );
    const y = Math.max(
      0,
      Math.min(1, (e.clientY - rect.top - offsetRef.current.y) / rect.height),
    );

    dispatch({
      type: 'UPDATE_SUBTITLE',
      payload: { id: subtitle.id, updates: { x, y } },
    });
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  return (
    <div
      ref={elRef}
      className="absolute px-3 py-1.5 rounded bg-black/60 text-white font-bold text-sm whitespace-nowrap cursor-grab active:cursor-grabbing pointer-events-auto"
      style={posStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {subtitle.text}
    </div>
  );
}
