import { describe, it, expect } from 'vitest';
import { historyReducer, createInitialHistory, createInitialState } from './editorReducer';
import type { EditorState } from '@/types/editor';

describe('editorReducer — RESTORE preserves watermark', () => {
  it('does not clobber a paid (watermark: false) restored state', () => {
    const history = createInitialHistory();
    const restoredState: EditorState = {
      ...createInitialState(),
      jobId: 'job-1',
      jobName: 'Test Job',
      watermark: false,
    };

    const next = historyReducer(history, { type: 'RESTORE', payload: restoredState });

    expect(next.present.watermark).toBe(false);
  });

  it('preserves an undefined watermark (fail-safe: export-server will apply it)', () => {
    const history = createInitialHistory();
    const restoredState: EditorState = {
      ...createInitialState(),
      jobId: 'job-1',
      jobName: 'Test Job',
      watermark: undefined,
    };

    const next = historyReducer(history, { type: 'RESTORE', payload: restoredState });

    expect(next.present.watermark).toBeUndefined();
  });
});
