/**
 * Pure conversion logic for the one-time legacy flat-rate -> proportional-
 * pricing migration (see tools/convert-legacy-credits.ts). Pre-2026-07-30
 * flat-rate customers paid 1 credit per generation regardless of settings;
 * proportional pricing (credit-cost.ts) charges up to 6x that for the same
 * settings, so their remaining paid balance is scaled up by the same factor
 * to keep the generations they already paid for.
 *
 * Deliberately does NOT touch `used` (usage history) or `purchases` (audit
 * trail) — only `total` is adjusted, and only by exactly the amount needed
 * to make the REMAINING balance 6x what it was.
 */

import type { CreditRecord } from '@/types';

const LEGACY_CONVERSION_MULTIPLIER = 6;

/** Convert a paid CreditRecord so its remaining balance becomes exactly 6x. Pure — does not mutate the input. */
export function convertLegacyRecord(record: CreditRecord): CreditRecord {
  const remainingPaid = record.total - record.used;
  const newRemaining = remainingPaid * LEGACY_CONVERSION_MULTIPLIER;
  const delta = newRemaining - remainingPaid;
  return {
    ...record,
    total: record.total + delta,
  };
}

export interface ConversionSummary {
  before: { total: number; used: number; remaining: number };
  after: { total: number; used: number; remaining: number };
}

/** Before/after diff for a conversion, for printing in the CLI tool. */
export function summarizeConversion(record: CreditRecord): ConversionSummary {
  const after = convertLegacyRecord(record);
  return {
    before: { total: record.total, used: record.used, remaining: record.total - record.used },
    after: { total: after.total, used: after.used, remaining: after.total - after.used },
  };
}
