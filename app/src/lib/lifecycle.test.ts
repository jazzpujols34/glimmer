import { describe, it, expect } from 'vitest';
import {
  canTransitionJob,
  canTransitionQuick,
  isTerminalJobStatus,
  isTerminalQuickStatus,
  isTerminalBatchStatus,
  missingSegmentIsPending,
  deriveBatchStatus,
} from './lifecycle';
import type { GenerationStatus, QuickJobStatus } from '@/types';

describe('canTransitionJob', () => {
  it.each([
    ['queued', 'processing'],
    ['queued', 'error'],
    ['processing', 'complete'],
    ['processing', 'error'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransitionJob(from, to)).toBe(true);
  });

  it.each([
    ['queued', 'complete'],
    ['processing', 'queued'],
    ['complete', 'processing'],
    ['complete', 'error'],
    ['error', 'processing'],
    ['error', 'complete'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(canTransitionJob(from, to)).toBe(false);
  });

  it('allows a same-status rewrite, even from a terminal status', () => {
    expect(canTransitionJob('complete', 'complete')).toBe(true);
    expect(canTransitionJob('error', 'error')).toBe(true);
  });

  it('treats an unknown stored status as open', () => {
    expect(canTransitionJob('legacy' as GenerationStatus, 'complete')).toBe(true);
  });
});

describe('canTransitionQuick', () => {
  it.each([
    ['generating', 'exporting'],
    ['generating', 'error'],
    ['exporting', 'complete'],
    ['exporting', 'error'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransitionQuick(from, to)).toBe(true);
  });

  it.each([
    ['generating', 'complete'],
    ['exporting', 'generating'],
    ['complete', 'exporting'],
    ['error', 'generating'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(canTransitionQuick(from, to)).toBe(false);
  });

  it('allows a same-status rewrite and treats unknown status as open', () => {
    expect(canTransitionQuick('complete', 'complete')).toBe(true);
    expect(canTransitionQuick('legacy' as QuickJobStatus, 'complete')).toBe(true);
  });
});

describe('terminal predicates', () => {
  it('isTerminalJobStatus is true only for complete and error', () => {
    expect(isTerminalJobStatus('queued')).toBe(false);
    expect(isTerminalJobStatus('processing')).toBe(false);
    expect(isTerminalJobStatus('complete')).toBe(true);
    expect(isTerminalJobStatus('error')).toBe(true);
  });

  it('isTerminalQuickStatus is true only for complete and error', () => {
    expect(isTerminalQuickStatus('generating')).toBe(false);
    expect(isTerminalQuickStatus('exporting')).toBe(false);
    expect(isTerminalQuickStatus('complete')).toBe(true);
    expect(isTerminalQuickStatus('error')).toBe(true);
  });

  it('unknown status is not terminal (job and quick)', () => {
    expect(isTerminalJobStatus('legacy' as GenerationStatus)).toBe(false);
    expect(isTerminalQuickStatus('legacy' as QuickJobStatus)).toBe(false);
  });

  it('isTerminalBatchStatus is true for complete, partial and error', () => {
    expect(isTerminalBatchStatus('queued')).toBe(false);
    expect(isTerminalBatchStatus('processing')).toBe(false);
    expect(isTerminalBatchStatus('complete')).toBe(true);
    expect(isTerminalBatchStatus('partial')).toBe(true);
    expect(isTerminalBatchStatus('error')).toBe(true);
  });
});

describe('missingSegmentIsPending', () => {
  const created = '2026-01-01T00:00:00.000Z';
  const createdMs = new Date(created).getTime();
  const DAY = 24 * 60 * 60 * 1000;

  it('is pending for a batch younger than 24 hours', () => {
    expect(missingSegmentIsPending(created, createdMs + 1000)).toBe(true);
    expect(missingSegmentIsPending(created, createdMs + DAY - 1)).toBe(true);
  });

  it('is not pending at exactly 24 hours or older', () => {
    expect(missingSegmentIsPending(created, createdMs + DAY)).toBe(false);
    expect(missingSegmentIsPending(created, createdMs + 3 * DAY)).toBe(false);
  });

  it('uses the real clock when now is omitted', () => {
    expect(missingSegmentIsPending(new Date().toISOString())).toBe(true);
    expect(missingSegmentIsPending(new Date(Date.now() - 2 * DAY).toISOString())).toBe(false);
  });
});

describe('deriveBatchStatus', () => {
  it('is complete when all segments completed', () => {
    expect(deriveBatchStatus({ completed: 3, failed: 0, pending: 0 })).toBe('complete');
  });

  it('is error when all segments failed', () => {
    expect(deriveBatchStatus({ completed: 0, failed: 3, pending: 0 })).toBe('error');
  });

  it('is partial when some completed and some failed', () => {
    expect(deriveBatchStatus({ completed: 2, failed: 1, pending: 0 })).toBe('partial');
  });

  it('is processing while any segment is pending', () => {
    expect(deriveBatchStatus({ completed: 2, failed: 0, pending: 1 })).toBe('processing');
    expect(deriveBatchStatus({ completed: 0, failed: 2, pending: 1 })).toBe('processing');
  });

  it('is processing for an empty batch (no segments counted)', () => {
    expect(deriveBatchStatus({ completed: 0, failed: 0, pending: 0 })).toBe('processing');
  });
});
