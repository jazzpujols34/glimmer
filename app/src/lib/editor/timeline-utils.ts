import type { EditorState, TimelineClip, MusicClip, TitleCard, SubtitleSegment } from '@/types/editor';

/** Effective duration of a clip after trim and speed */
export function getClipDuration(clip: TimelineClip): number {
  return (clip.trimEnd - clip.trimStart) / clip.speed;
}

/** Effective duration of a music clip (no speed) */
export function getMusicClipDuration(clip: MusicClip): number {
  return clip.trimEnd - clip.trimStart;
}

/** Calculate total timeline duration based on free clip positions */
export function getTotalDuration(state: EditorState): number {
  let maxEnd = 0;

  if (state.titleCard) {
    maxEnd = state.titleCard.durationSeconds;
  }

  for (const clip of state.clips) {
    const clipEnd = clip.timelinePosition + getClipDuration(clip);
    maxEnd = Math.max(maxEnd, clipEnd);
  }

  for (const mc of state.musicClips) {
    const mcEnd = mc.timelinePosition + getMusicClipDuration(mc);
    maxEnd = Math.max(maxEnd, mcEnd);
  }

  if (state.outroCard) {
    maxEnd += state.outroCard.durationSeconds;
  }

  return Math.max(0, maxEnd);
}

/** Where the outro card starts (= end of all clips / title card) */
export function getOutroStart(state: EditorState): number {
  let maxEnd = 0;

  if (state.titleCard) {
    maxEnd = state.titleCard.durationSeconds;
  }

  for (const clip of state.clips) {
    const clipEnd = clip.timelinePosition + getClipDuration(clip);
    maxEnd = Math.max(maxEnd, clipEnd);
  }

  for (const mc of state.musicClips) {
    const mcEnd = mc.timelinePosition + getMusicClipDuration(mc);
    maxEnd = Math.max(maxEnd, mcEnd);
  }

  return maxEnd;
}

/** Map of clip ID -> timeline start position (seconds) */
export function getClipStartPositions(state: EditorState): Map<string, number> {
  const positions = new Map<string, number>();
  for (const clip of state.clips) {
    positions.set(clip.id, clip.timelinePosition);
  }
  return positions;
}

/** Sort clips by their timeline position */
export function clipsSortedByPosition(clips: TimelineClip[]): TimelineClip[] {
  return [...clips].sort((a, b) => a.timelinePosition - b.timelinePosition);
}

/** Info about what's active at a given timeline position */
export interface ActiveElement {
  kind: 'title' | 'clip' | 'outro' | 'gap' | 'none';
  clip?: TimelineClip;
  clipIndex?: number;
  localTime?: number; // time within the clip (accounting for trimStart + speed)
  // Title/outro card
  card?: TitleCard;
}

/** Determine what's visible at a given timeline position */
export function getActiveElementAtPosition(position: number, state: EditorState): ActiveElement {
  // Title card
  if (state.titleCard) {
    if (position < state.titleCard.durationSeconds) {
      return { kind: 'title', card: state.titleCard };
    }
  }

  // Check each clip (free positioned)
  for (let i = 0; i < state.clips.length; i++) {
    const clip = state.clips[i];
    const clipStart = clip.timelinePosition;
    const clipDuration = getClipDuration(clip);
    const clipEnd = clipStart + clipDuration;

    if (position >= clipStart && position < clipEnd) {
      const elapsed = position - clipStart;
      const localTime = clip.trimStart + elapsed * clip.speed;
      return { kind: 'clip', clip, clipIndex: i, localTime };
    }
  }

  // Outro card
  if (state.outroCard) {
    const outroStart = getOutroStart(state);
    if (position >= outroStart) {
      return { kind: 'outro', card: state.outroCard };
    }
  }

  // If position is within the timeline but no clip covers it → gap
  if (position >= 0 && position < getTotalDuration(state)) {
    return { kind: 'gap' };
  }

  return { kind: 'none' };
}

/** Get all subtitles active at a given position */
export function getActiveSubtitles(position: number, subtitles: SubtitleSegment[]): SubtitleSegment[] {
  return subtitles.filter(s => position >= s.startTime && position < s.endTime);
}

/** Generate a simple unique ID */
export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Find the next clip (by position) after a given timeline position */
export function findNextClip(
  position: number,
  clips: TimelineClip[],
): { clip: TimelineClip; index: number } | null {
  const sorted = clipsSortedByPosition(clips);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].timelinePosition > position) {
      // Find original index
      const originalIndex = clips.indexOf(sorted[i]);
      return { clip: sorted[i], index: originalIndex };
    }
  }
  return null;
}

// === Snap & Ripple helpers ===

/** How far can selected clips move left to close the nearest gap? */
export function getSnapLeftDelta(
  selectedIds: string[],
  clips: TimelineClip[],
  titleCardEnd: number,
): number {
  const selectedSet = new Set(selectedIds);
  const sorted = clipsSortedByPosition(clips);
  const selectedSorted = sorted.filter(c => selectedSet.has(c.id));
  if (selectedSorted.length === 0) return 0;

  const leftmostPos = selectedSorted[0].timelinePosition;

  // Nearest left boundary: previous non-selected clip end, titleCardEnd, or 0
  let boundary = Math.max(0, titleCardEnd);
  for (const clip of sorted) {
    if (selectedSet.has(clip.id)) continue;
    const clipEnd = clip.timelinePosition + getClipDuration(clip);
    if (clipEnd <= leftmostPos) {
      boundary = Math.max(boundary, clipEnd);
    }
  }

  return leftmostPos - boundary;
}

/** How far can selected clips move right to close the nearest gap? */
export function getSnapRightDelta(
  selectedIds: string[],
  clips: TimelineClip[],
): number {
  const selectedSet = new Set(selectedIds);
  const sorted = clipsSortedByPosition(clips);
  const selectedSorted = sorted.filter(c => selectedSet.has(c.id));
  if (selectedSorted.length === 0) return 0;

  const rightmost = selectedSorted[selectedSorted.length - 1];
  const rightmostEnd = rightmost.timelinePosition + getClipDuration(rightmost);

  // Find nearest right boundary: first non-selected clip that starts at or after rightmostEnd
  for (const clip of sorted) {
    if (selectedSet.has(clip.id)) continue;
    if (clip.timelinePosition >= rightmostEnd) {
      return clip.timelinePosition - rightmostEnd;
    }
  }
  return 0; // nothing to snap to on the right
}

/** Remove selected clips and shift remaining clips left to close gaps. */
export function rippleDeleteClips(
  selectedIds: string[],
  clips: TimelineClip[],
): TimelineClip[] {
  const selectedSet = new Set(selectedIds);
  const sorted = clipsSortedByPosition(clips);

  // For each remaining clip, count total duration of deleted clips before it
  const remaining: TimelineClip[] = [];
  for (const clip of sorted) {
    if (selectedSet.has(clip.id)) continue;

    let shiftLeft = 0;
    for (const other of sorted) {
      if (!selectedSet.has(other.id)) continue;
      if (other.timelinePosition < clip.timelinePosition) {
        shiftLeft += getClipDuration(other);
      }
    }

    remaining.push({
      ...clip,
      timelinePosition: Math.max(0, clip.timelinePosition - shiftLeft),
    });
  }

  return clipsSortedByPosition(remaining);
}
