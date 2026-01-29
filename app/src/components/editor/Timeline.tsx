'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useEditor, useEditorDispatch } from './EditorContext';
import { TimelineClipComponent } from './TimelineClip';
import { TransitionPicker } from './TransitionPicker';
import {
  Scissors,
  Film,
  Type,
  Music,
  Zap,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  getClipDuration,
  getActiveElementAtPosition,
  getOutroStart,
} from '@/lib/editor/timeline-utils';
import type { TrackId, TrackState, EditorAction } from '@/types/editor';
import { cn } from '@/lib/utils';
import type { Dispatch } from 'react';
import type { LucideIcon } from 'lucide-react';

// --- Track label component ---

function TrackLabel({
  trackId,
  label,
  icon: Icon,
  height,
  trackState,
  dispatch,
  showLock,
  showVisibility,
}: {
  trackId: TrackId;
  label: string;
  icon: LucideIcon;
  height: string;
  trackState: TrackState;
  dispatch: Dispatch<EditorAction>;
  showLock?: boolean;
  showVisibility?: boolean;
}) {
  const toggle = (key: keyof TrackState) => {
    dispatch({
      type: 'SET_TRACK_STATE',
      payload: { trackId, updates: { [key]: !trackState[key] } },
    });
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 border-b border-border bg-muted/50 text-[10px] text-muted-foreground',
        !trackState.visible && 'opacity-40',
      )}
      style={{ height }}
    >
      <div className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => toggle('muted')}
          className={cn('p-0.5 rounded hover:bg-muted', trackState.muted && 'text-destructive')}
          title={trackState.muted ? '取消靜音' : '靜音'}
        >
          {trackState.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
        </button>
        {showLock && (
          <button
            onClick={() => toggle('locked')}
            className={cn('p-0.5 rounded hover:bg-muted', trackState.locked && 'text-yellow-500')}
            title={trackState.locked ? '解鎖' : '鎖定'}
          >
            {trackState.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </button>
        )}
        {showVisibility && (
          <button
            onClick={() => toggle('visible')}
            className={cn('p-0.5 rounded hover:bg-muted', !trackState.visible && 'text-muted-foreground/30')}
            title={trackState.visible ? '隱藏' : '顯示'}
          >
            {trackState.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Main Timeline component ---

export function Timeline() {
  const state = useEditor();
  const dispatch = useEditorDispatch();
  const trackRef = useRef<HTMLDivElement>(null);

  const totalDur = state.totalDuration;

  // --- Interaction mode refs (scrubbing vs clip drag vs resize) ---
  const isScrubbing = useRef(false);
  const draggingClip = useRef<{
    clipId: string;
    offsetSeconds: number;
    initialPositions: Map<string, number>;
  } | null>(null);
  const draggingMusicClip = useRef<{
    clipId: string;
    offsetSeconds: number;
  } | null>(null);
  const resizingHandle = useRef<{
    type: 'video' | 'music';
    clipId: string;
    edge: 'left' | 'right';
    initialTrimStart: number;
    initialTrimEnd: number;
    initialTimelinePosition: number;
    initialMouseSeconds: number;
    speed: number;
    maxTrimEnd: number;
  } | null>(null);

  // --- Seek helper: convert clientX → timeline seconds ---
  const clientXToSeconds = useCallback(
    (clientX: number): number => {
      if (!trackRef.current || totalDur <= 0) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * totalDur;
    },
    [totalDur],
  );

  // --- Click-to-seek (fires after mouseup if no drag occurred) ---
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingClip.current || draggingMusicClip.current || resizingHandle.current) return;
      const seconds = clientXToSeconds(e.clientX);
      dispatch({ type: 'SET_PLAYHEAD', payload: seconds });
    },
    [clientXToSeconds, dispatch],
  );

  // --- Mouse down: start resize, music drag, clip drag, or scrubbing ---
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 1. Check for resize handle FIRST
      const resizeEl = (e.target as HTMLElement).closest('[data-resize-edge]') as HTMLElement | null;
      if (resizeEl) {
        e.preventDefault();
        const edge = resizeEl.dataset.resizeEdge as 'left' | 'right';
        const resizeType = resizeEl.dataset.resizeType as 'video' | 'music';
        const clipId = resizeEl.dataset.clipId!;
        const seconds = clientXToSeconds(e.clientX);

        if (resizeType === 'video') {
          const clip = state.clips.find(c => c.id === clipId);
          if (!clip) return;
          resizingHandle.current = {
            type: 'video', clipId, edge,
            initialTrimStart: clip.trimStart,
            initialTrimEnd: clip.trimEnd,
            initialTimelinePosition: clip.timelinePosition,
            initialMouseSeconds: seconds,
            speed: clip.speed,
            maxTrimEnd: clip.originalDuration,
          };
        } else {
          const mc = state.musicClips.find(c => c.id === clipId);
          if (!mc) return;
          resizingHandle.current = {
            type: 'music', clipId, edge,
            initialTrimStart: mc.trimStart,
            initialTrimEnd: mc.trimEnd,
            initialTimelinePosition: mc.timelinePosition,
            initialMouseSeconds: seconds,
            speed: 1,
            maxTrimEnd: mc.originalDuration,
          };
        }
        return;
      }

      // 2. Check for music clip drag
      const musicEl = (e.target as HTMLElement).closest('[data-music-clip-id]') as HTMLElement | null;
      if (musicEl && musicEl.dataset.musicClipId) {
        e.preventDefault();
        if (state.trackStates.music.locked) return;
        const clipId = musicEl.dataset.musicClipId;
        const mc = state.musicClips.find(c => c.id === clipId);
        if (!mc) return;
        dispatch({ type: 'SELECT_MUSIC_CLIP', payload: clipId });
        const seconds = clientXToSeconds(e.clientX);
        draggingMusicClip.current = {
          clipId,
          offsetSeconds: seconds - mc.timelinePosition,
        };
        return;
      }

      // 3. Check for video clip drag
      const clipEl = (e.target as HTMLElement).closest('[data-clip-id]') as HTMLElement | null;
      if (clipEl && clipEl.dataset.clipId) {
        e.preventDefault();
        if (state.trackStates.video.locked) return;

        const clipId = clipEl.dataset.clipId;
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;

        const isAlreadySelected = state.selectedClipIds.includes(clipId);

        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          dispatch({
            type: 'SELECT_CLIP',
            payload: { clipId, shiftKey: e.shiftKey, metaKey: e.metaKey || e.ctrlKey },
          });
          return;
        }

        if (!isAlreadySelected) {
          dispatch({ type: 'SELECT_CLIP', payload: { clipId } });
        }

        const seconds = clientXToSeconds(e.clientX);
        const selectedIds = isAlreadySelected ? state.selectedClipIds : [clipId];

        const initialPositions = new Map<string, number>();
        for (const c of state.clips) {
          if (selectedIds.includes(c.id)) {
            initialPositions.set(c.id, c.timelinePosition);
          }
        }

        draggingClip.current = {
          clipId,
          offsetSeconds: seconds - clip.timelinePosition,
          initialPositions,
        };
      } else {
        // 4. Empty area: start scrubbing + deselect
        e.preventDefault();
        isScrubbing.current = true;
        dispatch({ type: 'SET_PLAYING', payload: false });
        dispatch({ type: 'DESELECT_ALL' });
        const seconds = clientXToSeconds(e.clientX);
        dispatch({ type: 'SET_PLAYHEAD', payload: seconds });
      }
    },
    [clientXToSeconds, dispatch, state.clips, state.musicClips, state.selectedClipIds, state.trackStates.video.locked, state.trackStates.music.locked],
  );

  // --- Document-level mousemove/mouseup for scrub + clip drag + resize ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Resize handle
      if (resizingHandle.current) {
        const r = resizingHandle.current;
        const seconds = clientXToSeconds(e.clientX);
        const deltaSec = seconds - r.initialMouseSeconds;
        const MIN_DURATION = 0.1;

        if (r.edge === 'left') {
          const sourceDelta = deltaSec * r.speed;
          let newTrimStart = Math.max(0, r.initialTrimStart + sourceDelta);
          newTrimStart = Math.min(newTrimStart, r.initialTrimEnd - MIN_DURATION * r.speed);
          const newTimelinePos = r.initialTimelinePosition + (newTrimStart - r.initialTrimStart) / r.speed;

          if (r.type === 'video') {
            dispatch({ type: 'SET_TRIM', payload: { clipId: r.clipId, trimStart: newTrimStart, trimEnd: r.initialTrimEnd } });
            dispatch({ type: 'SET_CLIP_POSITION', payload: { clipId: r.clipId, timelinePosition: newTimelinePos } });
          } else {
            dispatch({ type: 'SET_MUSIC_CLIP_TRIM', payload: {
              id: r.clipId, trimStart: newTrimStart, trimEnd: r.initialTrimEnd, timelinePosition: newTimelinePos
            }});
          }
        } else {
          const sourceDelta = deltaSec * r.speed;
          let newTrimEnd = Math.min(r.maxTrimEnd, r.initialTrimEnd + sourceDelta);
          newTrimEnd = Math.max(newTrimEnd, r.initialTrimStart + MIN_DURATION * r.speed);

          if (r.type === 'video') {
            dispatch({ type: 'SET_TRIM', payload: { clipId: r.clipId, trimStart: r.initialTrimStart, trimEnd: newTrimEnd } });
          } else {
            dispatch({ type: 'SET_MUSIC_CLIP_TRIM', payload: {
              id: r.clipId, trimStart: r.initialTrimStart, trimEnd: newTrimEnd
            }});
          }
        }
        return;
      }

      // Music clip drag
      if (draggingMusicClip.current) {
        const seconds = clientXToSeconds(e.clientX);
        const newPos = Math.max(0, seconds - draggingMusicClip.current.offsetSeconds);
        dispatch({ type: 'SET_MUSIC_CLIP_POSITION', payload: { id: draggingMusicClip.current.clipId, timelinePosition: newPos } });
        return;
      }

      // Scrubbing
      if (isScrubbing.current) {
        const seconds = clientXToSeconds(e.clientX);
        dispatch({ type: 'SET_PLAYHEAD', payload: seconds });
      } else if (draggingClip.current) {
        // Video clip drag
        const seconds = clientXToSeconds(e.clientX);
        const primaryOrigPos = draggingClip.current.initialPositions.get(draggingClip.current.clipId) ?? 0;
        const primaryNewPos = Math.max(0, seconds - draggingClip.current.offsetSeconds);
        const delta = primaryNewPos - primaryOrigPos;

        const positions = Array.from(draggingClip.current.initialPositions.entries()).map(
          ([id, origPos]) => ({ clipId: id, timelinePosition: Math.max(0, origPos + delta) })
        );
        dispatch({ type: 'SET_CLIPS_POSITIONS', payload: { positions } });
      }
    };

    const handleMouseUp = () => {
      isScrubbing.current = false;
      draggingClip.current = null;
      draggingMusicClip.current = null;
      resizingHandle.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [clientXToSeconds, dispatch]);

  // --- Keyboard handler ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Shift + Arrow: snap clips
      if (e.shiftKey && e.key === 'ArrowLeft' && state.selectedClipIds.length > 0) {
        e.preventDefault();
        dispatch({ type: 'SNAP_CLIPS_LEFT' });
        return;
      }
      if (e.shiftKey && e.key === 'ArrowRight' && state.selectedClipIds.length > 0) {
        e.preventDefault();
        dispatch({ type: 'SNAP_CLIPS_RIGHT' });
        return;
      }

      // Shift + Delete/Backspace: ripple delete
      if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace') && state.selectedClipIds.length > 0) {
        if (isInput) return;
        e.preventDefault();
        dispatch({ type: 'RIPPLE_DELETE' });
        return;
      }

      // Delete/Backspace: remove selected clips or music clip
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        if (state.selectedClipIds.length > 0) {
          e.preventDefault();
          dispatch({ type: 'REMOVE_SELECTED_CLIPS' });
          return;
        }
        if (state.selectedMusicClipId) {
          e.preventDefault();
          dispatch({ type: 'REMOVE_MUSIC_CLIP', payload: { id: state.selectedMusicClipId } });
          return;
        }
      }

      // Cmd/Ctrl + A: select all clips
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        if (isInput) return;
        e.preventDefault();
        dispatch({ type: 'SELECT_ALL_CLIPS' });
        return;
      }

      // Escape: deselect all
      if (e.key === 'Escape') {
        dispatch({ type: 'DESELECT_ALL' });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, state.selectedClipIds.length, state.selectedMusicClipId]);

  // --- Split ---
  const handleSplit = useCallback(() => {
    dispatch({ type: 'SPLIT_CLIP', payload: { playheadPosition: state.playheadPosition } });
    dispatch({ type: 'SPLIT_MUSIC_CLIP', payload: { playheadPosition: state.playheadPosition } });
  }, [dispatch, state.playheadPosition]);

  const activeElement = getActiveElementAtPosition(state.playheadPosition, state);
  const canSplitMusic = state.musicClips.some(mc => {
    const dur = mc.trimEnd - mc.trimStart;
    return state.playheadPosition >= mc.timelinePosition && state.playheadPosition < mc.timelinePosition + dur;
  });
  const canSplit = activeElement.kind === 'clip' || canSplitMusic;

  // --- Layout calculations ---
  const playheadPct = totalDur > 0 ? (state.playheadPosition / totalDur) * 100 : 0;

  const titleDur = state.titleCard ? state.titleCard.durationSeconds : 0;
  const outroDur = state.outroCard ? state.outroCard.durationSeconds : 0;
  const outroStart = getOutroStart(state);

  return (
    <div className="border-t border-border bg-muted/30">
      {/* Time ruler */}
      <div className="flex items-center justify-between px-4 py-1 text-[10px] text-muted-foreground border-b border-border">
        <span>0:00</span>
        <span>總長度: {totalDur.toFixed(1)}s</span>
        <span>{formatTime(totalDur)}</span>
      </div>

      {/* Multi-track layout */}
      <div className="px-4 py-2">
        <div className="flex">
          {/* Left gutter: track labels */}
          <div className="w-16 flex-shrink-0 flex flex-col border-r border-border">
            <TrackLabel
              trackId="video" label="影片" icon={Film} height="4rem"
              trackState={state.trackStates.video} dispatch={dispatch}
              showLock showVisibility
            />
            <TrackLabel
              trackId="subtitle" label="字幕" icon={Type} height="2rem"
              trackState={state.trackStates.subtitle} dispatch={dispatch}
              showVisibility
            />
            <TrackLabel
              trackId="music" label="音樂" icon={Music} height="1.5rem"
              trackState={state.trackStates.music} dispatch={dispatch}
            />
            <TrackLabel
              trackId="sfx" label="音效" icon={Zap} height="1.5rem"
              trackState={state.trackStates.sfx} dispatch={dispatch}
            />
          </div>

          {/* Content area */}
          <div
            ref={trackRef}
            className="flex-1 relative cursor-crosshair"
            onClick={handleTrackClick}
            onMouseDown={handleMouseDown}
          >
            {/* === Video lane === */}
            <div
              className={cn(
                'relative h-16 border-b border-border',
                !state.trackStates.video.visible && 'opacity-30',
              )}
            >
              {/* Title card */}
              {state.titleCard && totalDur > 0 && (
                <div
                  className="absolute top-0 h-full rounded-md overflow-hidden border border-border bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center"
                  style={{
                    left: '0%',
                    width: `${(titleDur / totalDur) * 100}%`,
                  }}
                >
                  <span className="text-[10px] text-muted-foreground truncate px-1">
                    {state.titleCard.text || '片頭'}
                  </span>
                </div>
              )}

              {/* Clips */}
              {state.clips.map((clip, index) => {
                const clipDur = getClipDuration(clip);
                const leftPct = totalDur > 0 ? (clip.timelinePosition / totalDur) * 100 : 0;
                const widthPct = totalDur > 0 ? (clipDur / totalDur) * 100 : 0;

                const prevClip = index > 0 ? state.clips[index - 1] : null;
                const prevEnd = prevClip
                  ? prevClip.timelinePosition + getClipDuration(prevClip)
                  : null;
                const isAdjacent = prevEnd !== null && Math.abs(prevEnd - clip.timelinePosition) < 0.05;

                return (
                  <div
                    key={clip.id}
                    className="absolute top-0"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      height: '4rem',
                    }}
                  >
                    {isAdjacent && state.transitions[index - 1] && (
                      <div
                        className="absolute -left-2 top-1/2 -translate-y-1/2 z-20"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <TransitionPicker
                          transition={state.transitions[index - 1]}
                          onChange={(t) =>
                            dispatch({ type: 'SET_TRANSITION', payload: { index: index - 1, transition: t } })
                          }
                        />
                      </div>
                    )}
                    <TimelineClipComponent
                      clip={clip}
                      index={index}
                      isSelected={state.selectedClipIds.includes(clip.id)}
                    />
                    {/* Left resize handle */}
                    <div
                      data-resize-edge="left"
                      data-resize-type="video"
                      data-clip-id={clip.id}
                      className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group"
                    >
                      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/40 rounded-l-md transition-colors" />
                    </div>
                    {/* Right resize handle */}
                    <div
                      data-resize-edge="right"
                      data-resize-type="video"
                      data-clip-id={clip.id}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group"
                    >
                      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/40 rounded-r-md transition-colors" />
                    </div>
                  </div>
                );
              })}

              {/* Outro card */}
              {state.outroCard && totalDur > 0 && (
                <div
                  className="absolute top-0 h-full rounded-md overflow-hidden border border-border bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center"
                  style={{
                    left: `${(outroStart / totalDur) * 100}%`,
                    width: `${(outroDur / totalDur) * 100}%`,
                  }}
                >
                  <span className="text-[10px] text-muted-foreground truncate px-1">
                    {state.outroCard.text || '片尾'}
                  </span>
                </div>
              )}

              {state.clips.length === 0 && (
                <div className="flex items-center justify-center w-full h-full text-sm text-muted-foreground">
                  沒有可編輯的影片片段
                </div>
              )}
            </div>

            {/* === Subtitle lane === */}
            <div
              className={cn(
                'relative h-8 border-b border-border',
                !state.trackStates.subtitle.visible && 'opacity-30',
              )}
            >
              {state.subtitles.map((sub) => {
                const left = totalDur > 0 ? (sub.startTime / totalDur) * 100 : 0;
                const width = totalDur > 0 ? ((sub.endTime - sub.startTime) / totalDur) * 100 : 0;
                return (
                  <div
                    key={sub.id}
                    className="absolute top-1 h-6 bg-blue-400/40 rounded-sm border border-blue-400/60 cursor-pointer flex items-center px-1"
                    style={{ left: `${left}%`, width: `${width}%`, minWidth: '4px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'SELECT_SUBTITLE', payload: sub.id });
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    title={sub.text}
                  >
                    <span className="text-[9px] text-white truncate">{sub.text}</span>
                  </div>
                );
              })}
            </div>

            {/* === Music lane === */}
            <div className="relative h-6 border-b border-border">
              {state.musicClips.map((mc) => {
                const mcDur = mc.trimEnd - mc.trimStart;
                const left = totalDur > 0 ? (mc.timelinePosition / totalDur) * 100 : 0;
                const width = totalDur > 0 ? (mcDur / totalDur) * 100 : 0;
                const isSelected = state.selectedMusicClipId === mc.id;
                return (
                  <div
                    key={mc.id}
                    data-music-clip-id={mc.id}
                    className={cn(
                      'absolute top-0.5 h-5 rounded-sm border cursor-grab active:cursor-grabbing select-none',
                      isSelected
                        ? 'bg-green-400/40 border-green-500 ring-1 ring-green-500/30'
                        : 'bg-green-400/20 border-green-400/30 hover:border-green-400/60'
                    )}
                    style={{ left: `${left}%`, width: `${width}%`, minWidth: '4px' }}
                  >
                    <span className="absolute inset-0 flex items-center px-2 text-[9px] text-green-700 truncate pointer-events-none">
                      {mc.name}
                    </span>
                    {/* Left resize handle */}
                    <div
                      data-resize-edge="left"
                      data-resize-type="music"
                      data-clip-id={mc.id}
                      className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group"
                    >
                      <div className="absolute inset-0 bg-white/0 group-hover:bg-green-300/60 rounded-l-sm transition-colors" />
                    </div>
                    {/* Right resize handle */}
                    <div
                      data-resize-edge="right"
                      data-resize-type="music"
                      data-clip-id={mc.id}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group"
                    >
                      <div className="absolute inset-0 bg-white/0 group-hover:bg-green-300/60 rounded-r-sm transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* === SFX lane === */}
            <div className="relative h-6">
              {state.sfx.map((item) => {
                const left = totalDur > 0 ? (item.startTime / totalDur) * 100 : 0;
                const width = totalDur > 0 ? (item.duration / totalDur) * 100 : 0;
                return (
                  <div
                    key={item.id}
                    className="absolute top-0.5 h-5 bg-orange-400/30 rounded-sm border border-orange-400/50 flex items-center px-1 cursor-pointer"
                    style={{ left: `${left}%`, width: `${width}%`, minWidth: '4px' }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    title={item.name}
                  >
                    <span className="text-[9px] text-orange-800 truncate">{item.name}</span>
                  </div>
                );
              })}
            </div>

            {/* Playhead — spans all lanes */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
              style={{ left: `${playheadPct}%` }}
            >
              <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-red-500 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-1 border-t border-border text-xs text-muted-foreground">
        <span>{formatTime(state.playheadPosition)}</span>

        <div className="flex items-center gap-3">
          {/* Keyboard shortcut hints */}
          {state.selectedClipIds.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60">
              ⇧← 靠左 · ⇧→ 靠右 · ⌫ 刪除 · ⇧⌫ 漣漪刪除
            </span>
          )}

          {/* Split button */}
          <button
            onClick={handleSplit}
            disabled={!canSplit}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={canSplit ? '在播放頭位置分割片段' : '播放頭不在片段上'}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>分割</span>
          </button>

          <span>
            {state.selectedClipIds.length > 1
              ? `${state.selectedClipIds.length} 已選取 / ${state.clips.length} 個片段`
              : `${state.clips.length} 個片段`}
          </span>
          {state.subtitles.length > 0 && <span>{state.subtitles.length} 字幕</span>}
          {state.musicClips.length > 0 && <span>{state.musicClips.length} 音樂</span>}
          {state.sfx.length > 0 && <span>{state.sfx.length} 音效</span>}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}
