import { describe, it, expect } from 'vitest';
import {
  getClipDuration,
  getMusicClipDuration,
  getTotalDuration,
  getOutroStart,
  clipsSortedByPosition,
  getActiveElementAtPosition,
  getActiveSubtitles,
  getSnapLeftDelta,
  getSnapRightDelta,
  rippleDeleteClips,
  findNextClip,
} from './timeline-utils';
import type { EditorState, TimelineClip, MusicClip, SubtitleSegment } from '@/types/editor';

// --- Test helpers ---

function makeClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'clip_1',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    blobUrl: 'blob:http://localhost/abc',
    originalDuration: 10,
    trimStart: 0,
    trimEnd: 10,
    speed: 1,
    filter: null,
    volume: 1,
    timelinePosition: 0,
    ...overrides,
  };
}

function makeState(overrides: Partial<EditorState> = {}): EditorState {
  return {
    jobId: 'test_job',
    jobName: 'Test',
    clips: [],
    transitions: [],
    subtitles: [],
    musicClips: [],
    sfx: [],
    titleCard: null,
    outroCard: null,
    trackStates: {
      video: { muted: false, locked: false, visible: true },
      subtitle: { muted: false, locked: false, visible: true },
      music: { muted: false, locked: false, visible: true },
      sfx: { muted: false, locked: false, visible: true },
    },
    playheadPosition: 0,
    isPlaying: false,
    selectedClipIds: [],
    selectedMusicClipId: null,
    selectedSubtitleId: null,
    activePanel: 'clips',
    exportProgress: null,
    totalDuration: 0,
    ...overrides,
  };
}

// --- Tests ---

describe('getClipDuration', () => {
  it('returns full duration at 1x speed', () => {
    const clip = makeClip({ trimStart: 0, trimEnd: 10, speed: 1 });
    expect(getClipDuration(clip)).toBe(10);
  });

  it('accounts for trim points', () => {
    const clip = makeClip({ trimStart: 2, trimEnd: 8, speed: 1 });
    expect(getClipDuration(clip)).toBe(6);
  });

  it('accounts for speed', () => {
    const clip = makeClip({ trimStart: 0, trimEnd: 10, speed: 2 });
    expect(getClipDuration(clip)).toBe(5);
  });

  it('handles half speed', () => {
    const clip = makeClip({ trimStart: 0, trimEnd: 4, speed: 0.5 });
    expect(getClipDuration(clip)).toBe(8);
  });

  it('combines trim and speed', () => {
    const clip = makeClip({ trimStart: 2, trimEnd: 6, speed: 2 });
    expect(getClipDuration(clip)).toBe(2);
  });
});

describe('getMusicClipDuration', () => {
  it('returns trimmed duration (no speed)', () => {
    const mc: MusicClip = {
      id: 'mc_1', name: 'Song', type: 'bundled', src: 'track.mp3', blobUrl: '',
      originalDuration: 180, trimStart: 10, trimEnd: 70, timelinePosition: 0, volume: 1,
    };
    expect(getMusicClipDuration(mc)).toBe(60);
  });
});

describe('getTotalDuration', () => {
  it('returns 0 for empty state', () => {
    expect(getTotalDuration(makeState())).toBe(0);
  });

  it('returns clip end for single clip', () => {
    const state = makeState({
      clips: [makeClip({ timelinePosition: 0, trimEnd: 5 })],
    });
    expect(getTotalDuration(state)).toBe(5);
  });

  it('includes title card duration', () => {
    const state = makeState({
      titleCard: { id: 'tc', type: 'intro', text: 'Title', durationSeconds: 3, backgroundColor: '#000', textColor: '#fff' },
    });
    expect(getTotalDuration(state)).toBe(3);
  });

  it('adds outro card duration', () => {
    const state = makeState({
      clips: [makeClip({ timelinePosition: 0, trimEnd: 5 })],
      outroCard: { id: 'oc', type: 'outro', text: 'End', durationSeconds: 2, backgroundColor: '#000', textColor: '#fff' },
    });
    expect(getTotalDuration(state)).toBe(7); // 5 + 2
  });

  it('handles non-zero timeline positions', () => {
    const state = makeState({
      clips: [
        makeClip({ id: 'a', timelinePosition: 0, trimEnd: 3 }),
        makeClip({ id: 'b', timelinePosition: 5, trimEnd: 4 }),
      ],
    });
    expect(getTotalDuration(state)).toBe(9); // 5 + 4
  });
});

describe('clipsSortedByPosition', () => {
  it('sorts clips by timeline position', () => {
    const clips = [
      makeClip({ id: 'b', timelinePosition: 5 }),
      makeClip({ id: 'a', timelinePosition: 0 }),
      makeClip({ id: 'c', timelinePosition: 3 }),
    ];
    const sorted = clipsSortedByPosition(clips);
    expect(sorted.map(c => c.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not mutate the original array', () => {
    const clips = [
      makeClip({ id: 'b', timelinePosition: 5 }),
      makeClip({ id: 'a', timelinePosition: 0 }),
    ];
    clipsSortedByPosition(clips);
    expect(clips[0].id).toBe('b');
  });
});

describe('getActiveElementAtPosition', () => {
  it('returns title card when position is within title', () => {
    const state = makeState({
      titleCard: { id: 'tc', type: 'intro', text: 'Title', durationSeconds: 3, backgroundColor: '#000', textColor: '#fff' },
      clips: [makeClip({ timelinePosition: 3, trimEnd: 5 })],
    });
    const result = getActiveElementAtPosition(1, state);
    expect(result.kind).toBe('title');
  });

  it('returns clip when position is on a clip', () => {
    const clip = makeClip({ id: 'c1', timelinePosition: 0, trimEnd: 5 });
    const state = makeState({ clips: [clip] });
    const result = getActiveElementAtPosition(2, state);
    expect(result.kind).toBe('clip');
    expect(result.clip?.id).toBe('c1');
    expect(result.localTime).toBe(2);
  });

  it('calculates localTime with speed', () => {
    const clip = makeClip({ timelinePosition: 0, trimStart: 2, trimEnd: 10, speed: 2 });
    const state = makeState({ clips: [clip] });
    // At position 1, elapsed = 1, localTime = trimStart + 1 * speed = 2 + 2 = 4
    const result = getActiveElementAtPosition(1, state);
    expect(result.localTime).toBe(4);
  });

  it('returns gap between clips', () => {
    const state = makeState({
      clips: [
        makeClip({ id: 'a', timelinePosition: 0, trimEnd: 3 }),
        makeClip({ id: 'b', timelinePosition: 5, trimEnd: 3 }),
      ],
    });
    const result = getActiveElementAtPosition(4, state);
    expect(result.kind).toBe('gap');
  });

  it('returns outro card after clips', () => {
    const state = makeState({
      clips: [makeClip({ timelinePosition: 0, trimEnd: 5 })],
      outroCard: { id: 'oc', type: 'outro', text: 'End', durationSeconds: 2, backgroundColor: '#000', textColor: '#fff' },
    });
    const result = getActiveElementAtPosition(5.5, state);
    expect(result.kind).toBe('outro');
  });

  it('returns none beyond total duration', () => {
    const state = makeState({
      clips: [makeClip({ timelinePosition: 0, trimEnd: 5 })],
    });
    const result = getActiveElementAtPosition(10, state);
    expect(result.kind).toBe('none');
  });
});

describe('getActiveSubtitles', () => {
  it('returns subtitles active at position', () => {
    const subs: SubtitleSegment[] = [
      { id: 's1', text: 'Hello', startTime: 0, endTime: 3, position: 'bottom' },
      { id: 's2', text: 'World', startTime: 2, endTime: 5, position: 'bottom' },
      { id: 's3', text: 'End', startTime: 6, endTime: 8, position: 'bottom' },
    ];
    const result = getActiveSubtitles(2.5, subs);
    expect(result.map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('returns empty array when none active', () => {
    const subs: SubtitleSegment[] = [
      { id: 's1', text: 'Hello', startTime: 5, endTime: 10, position: 'bottom' },
    ];
    expect(getActiveSubtitles(2, subs)).toEqual([]);
  });
});

describe('getSnapLeftDelta', () => {
  it('returns distance to gap on left', () => {
    const clips = [
      makeClip({ id: 'a', timelinePosition: 0, trimEnd: 3 }),
      makeClip({ id: 'b', timelinePosition: 5, trimEnd: 3 }),
    ];
    // Clip b starts at 5, clip a ends at 3, gap = 2
    const delta = getSnapLeftDelta(['b'], clips, 0);
    expect(delta).toBe(2);
  });

  it('returns 0 when no gap', () => {
    const clips = [
      makeClip({ id: 'a', timelinePosition: 0, trimEnd: 5 }),
      makeClip({ id: 'b', timelinePosition: 5, trimEnd: 3 }),
    ];
    const delta = getSnapLeftDelta(['b'], clips, 0);
    expect(delta).toBe(0);
  });

  it('respects title card end', () => {
    const clips = [
      makeClip({ id: 'a', timelinePosition: 5, trimEnd: 3 }),
    ];
    // titleCardEnd = 3, clip starts at 5, delta = 2
    const delta = getSnapLeftDelta(['a'], clips, 3);
    expect(delta).toBe(2);
  });
});

describe('getSnapRightDelta', () => {
  it('returns distance to next clip on right', () => {
    const clips = [
      makeClip({ id: 'a', timelinePosition: 0, trimEnd: 3 }),
      makeClip({ id: 'b', timelinePosition: 5, trimEnd: 3 }),
    ];
    // Clip a ends at 3, clip b starts at 5, delta = 2
    const delta = getSnapRightDelta(['a'], clips);
    expect(delta).toBe(2);
  });

  it('returns 0 when nothing to snap to', () => {
    const clips = [
      makeClip({ id: 'a', timelinePosition: 0, trimEnd: 5 }),
    ];
    const delta = getSnapRightDelta(['a'], clips);
    expect(delta).toBe(0);
  });
});

describe('rippleDeleteClips', () => {
  it('removes clips and shifts remaining left', () => {
    const clips = [
      makeClip({ id: 'a', timelinePosition: 0, trimEnd: 3 }),
      makeClip({ id: 'b', timelinePosition: 3, trimEnd: 2 }),
      makeClip({ id: 'c', timelinePosition: 5, trimEnd: 4 }),
    ];
    const result = rippleDeleteClips(['b'], clips);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[0].timelinePosition).toBe(0);
    expect(result[1].id).toBe('c');
    expect(result[1].timelinePosition).toBe(3); // shifted left by 2 (b's duration)
  });

  it('handles removing first clip', () => {
    const clips = [
      makeClip({ id: 'a', timelinePosition: 0, trimEnd: 5 }),
      makeClip({ id: 'b', timelinePosition: 5, trimEnd: 3 }),
    ];
    const result = rippleDeleteClips(['a'], clips);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
    expect(result[0].timelinePosition).toBe(0);
  });
});

describe('findNextClip', () => {
  it('finds the next clip after a position', () => {
    const clips = [
      makeClip({ id: 'a', timelinePosition: 0 }),
      makeClip({ id: 'b', timelinePosition: 5 }),
      makeClip({ id: 'c', timelinePosition: 10 }),
    ];
    const result = findNextClip(3, clips);
    expect(result?.clip.id).toBe('b');
  });

  it('returns null when no clip after position', () => {
    const clips = [makeClip({ id: 'a', timelinePosition: 0 })];
    expect(findNextClip(5, clips)).toBeNull();
  });
});
