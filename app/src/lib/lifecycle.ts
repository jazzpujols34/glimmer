/**
 * The app's status lifecycles, written down once.
 *
 * Pure tables and predicates with type-only imports, so server routes, client
 * pages and tests can all share them at no bundle cost. storage.ts enforces
 * the tables on every write; pages use the `isTerminal*` predicates to decide
 * when to stop polling.
 *
 *   job:    queued -> processing -> complete | error      (queued -> error too)
 *   batch:  queued -> processing -> complete | partial | error
 *   quick:  generating -> exporting -> complete | error   (generating -> error too)
 */
import type { BatchStatus, GenerationStatus, QuickJobStatus } from '@/types';

type TransitionTable<S extends string> = Record<S, readonly S[]>;

export const JOB_TRANSITIONS: TransitionTable<GenerationStatus> = {
  queued: ['processing', 'error'],
  processing: ['complete', 'error'],
  complete: [],
  error: [],
};

export const QUICK_TRANSITIONS: TransitionTable<QuickJobStatus> = {
  generating: ['exporting', 'error'],
  exporting: ['complete', 'error'],
  complete: [],
  error: [],
};

function canTransition<S extends string>(table: TransitionTable<S>, from: S, to: S): boolean {
  return from === to || table[from].includes(to);
}

export const canTransitionJob = (from: GenerationStatus, to: GenerationStatus) =>
  canTransition(JOB_TRANSITIONS, from, to);

export const canTransitionQuick = (from: QuickJobStatus, to: QuickJobStatus) =>
  canTransition(QUICK_TRANSITIONS, from, to);

export const isTerminalJobStatus = (status: GenerationStatus) => JOB_TRANSITIONS[status].length === 0;

export const isTerminalQuickStatus = (status: QuickJobStatus) => QUICK_TRANSITIONS[status].length === 0;

export const isTerminalBatchStatus = (status: BatchStatus) =>
  status === 'complete' || status === 'partial' || status === 'error';

/**
 * A batch has no status of its own — it is a summary of its segment jobs.
 * `pending` = segments still queued or processing. A segment whose record no
 * longer exists must be counted by the caller as failed, never as pending.
 */
export function deriveBatchStatus(counts: { completed: number; failed: number; pending: number }): BatchStatus {
  const { completed, failed, pending } = counts;
  if (pending > 0 || completed + failed === 0) return 'processing';
  if (failed === 0) return 'complete';
  return completed === 0 ? 'error' : 'partial';
}
