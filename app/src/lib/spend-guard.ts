/**
 * Daily provider-spend circuit breaker.
 *
 * BytePlus bills by tokens (see credit-cost.ts). A misconfigured client, a
 * retry storm, or an abused endpoint can run up real provider cost fast — a
 * July billing surprise (US$36 in a short window) motivated this guard.
 * Tracks an *estimated* token spend per UTC day in KV and refuses new
 * generations once the day's estimate reaches a cap.
 *
 * KV counter races (two concurrent requests reading the same pre-write
 * total) are acceptable here — this is an approximate guard, not a billing
 * ledger. Worst case is a few requests over/under the cap, not corruption.
 */

import { kvGet, kvPut } from './kv';
import { resolveGenerationParams } from './credit-cost';
import type { GenerationSettings } from '@/types';

const SPEND_KEY_PREFIX = 'spend:';
const SPEND_TTL_SECONDS = 172800; // 48h — outlives the UTC day it's keyed by
const DEFAULT_DAILY_TOKEN_CAP = 15_000_000; // ≈ US$18/day at $0.0012/K tokens
const FPS = 24;

export interface DailySpendCapCheck {
  capped: boolean;
  cap: number; // 0 means the cap is disabled
  spent: number;
}

/** Estimated provider tokens for one generation request. */
export function estimatedTokensForGeneration(settings: GenerationSettings): number {
  const { pixels, duration, numResults } = resolveGenerationParams(settings);
  return Math.round((pixels * FPS * duration * numResults) / 1024);
}

function todayKey(): string {
  return `${SPEND_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

function dailyTokenCap(): number {
  const raw = process.env.DAILY_PROVIDER_TOKEN_CAP;
  if (raw === undefined || raw === '') return DEFAULT_DAILY_TOKEN_CAP;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_DAILY_TOKEN_CAP;
  return parsed; // 0 means disabled
}

async function getSpentToday(): Promise<number> {
  const raw = await kvGet(todayKey());
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Check whether today's accumulated provider spend has reached the cap. */
export async function checkDailySpendCap(): Promise<DailySpendCapCheck> {
  const cap = dailyTokenCap();
  if (cap === 0) {
    return { capped: false, cap: 0, spent: 0 };
  }
  const spent = await getSpentToday();
  return { capped: spent >= cap, cap, spent };
}

/** Record estimated provider tokens spent, accumulating into today's counter. */
export async function recordProviderSpend(tokens: number): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  const spent = await getSpentToday();
  await kvPut(todayKey(), String(spent + tokens), { expirationTtl: SPEND_TTL_SECONDS });
}
