/**
 * Credit system: email-based generation tracking.
 * "Generation" = one AI video clip (5-12 sec)
 * "Video" = final edited product (made from multiple generations)
 *
 * Free tier: 3 generations per email
 * Paid: buy generation packs, never expire
 */

import { kvGet, kvPut } from './kv';
import type { CreditBalance, CreditRecord, PurchaseRecord, FreeRecord } from '@/types';
import { FREE_GENERATIONS } from '@/types';

const CREDIT_PREFIX = 'credits:';
const FREE_PREFIX = 'free:';
const VERIFIED_PREFIX = 'verified:';

// Admin emails get unlimited generations (set via ADMIN_EMAILS env var)
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.toLowerCase().trim())
  .filter(Boolean);

export function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

// --- Email helpers ---

function normalize(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Canonicalize an email for the free tier's identity check ONLY — collapses
 * Gmail/Googlemail plus-addressing (user+anything@gmail.com) and dot tricks
 * (u.s.e.r@gmail.com) to one canonical form, since Gmail itself ignores both
 * and a single inbox could otherwise farm unlimited free tiers by varying
 * them. Other domains don't reliably ignore dots/plus (many distinguish
 * them), so they pass through with only the standard lowercase/trim.
 *
 * Used ONLY for deriving the `free:` KV key (getFreeRecord/saveFreeRecord
 * below) — never for `credits:`/`verified:` keys or any paid-identity
 * lookup, which stay exact-email via normalize().
 *
 * Existing raw-key free records for gmail addresses that contain +/dots
 * become orphaned by this change (their usage count resets to 0) — accepted
 * at current ~30-user scale.
 */
export function canonicalFreeTierEmail(email: string): string {
  const trimmed = normalize(email);
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1) return trimmed;

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') {
    return trimmed;
  }

  const withoutPlus = local.split('+')[0];
  const withoutDots = withoutPlus.replace(/\./g, '');
  return `${withoutDots}@${domain}`;
}

// --- Email Verification ---

export async function isEmailVerified(email: string): Promise<boolean> {
  const data = await kvGet(`${VERIFIED_PREFIX}${normalize(email)}`);
  return data === 'true';
}

export async function setEmailVerified(email: string): Promise<void> {
  await kvPut(`${VERIFIED_PREFIX}${normalize(email)}`, 'true');
}

// --- Credit Record CRUD ---

export async function getCreditRecord(email: string): Promise<CreditRecord> {
  const data = await kvGet(`${CREDIT_PREFIX}${normalize(email)}`);
  if (data) return JSON.parse(data);
  return { total: 0, used: 0, purchases: [] };
}

async function saveCreditRecord(email: string, record: CreditRecord): Promise<void> {
  await kvPut(`${CREDIT_PREFIX}${normalize(email)}`, JSON.stringify(record));
}

// --- Free Tier CRUD ---

// Exported for admin routes that need per-user free-tier usage (list views) —
// always read free-tier records through this, never reparse the raw KV value,
// so the boolean->number migration below stays the single source of truth.
export async function getFreeRecord(email: string): Promise<FreeRecord> {
  const data = await kvGet(`${FREE_PREFIX}${canonicalFreeTierEmail(email)}`);
  if (data) {
    const parsed = JSON.parse(data);
    // Migration: convert old boolean format to new number format
    if (typeof parsed.used === 'boolean') {
      return { used: parsed.used ? FREE_GENERATIONS : 0, jobs: parsed.jobId ? [parsed.jobId] : [] };
    }
    return parsed;
  }
  return { used: 0, jobs: [] };
}

async function saveFreeRecord(email: string, record: FreeRecord): Promise<void> {
  await kvPut(`${FREE_PREFIX}${canonicalFreeTierEmail(email)}`, JSON.stringify(record));
}

// --- Public API ---

/** Check generation balance for an email address. */
export async function checkCredits(email: string): Promise<CreditBalance> {
  const norm = normalize(email);

  // Admins get unlimited generations
  if (isAdmin(norm)) {
    return {
      email: norm,
      paidTotal: 999999,
      paidUsed: 0,
      freeUsed: 0,
      freeTotal: FREE_GENERATIONS,
      remaining: 999999,
      verified: true,
      isAdmin: true,
    };
  }

  const [record, free, verified] = await Promise.all([
    getCreditRecord(norm),
    getFreeRecord(norm),
    isEmailVerified(norm),
  ]);

  const paidRemaining = record.total - record.used;
  const freeRemaining = Math.max(0, FREE_GENERATIONS - free.used);

  return {
    email: norm,
    paidTotal: record.total,
    paidUsed: record.used,
    freeUsed: free.used,
    freeTotal: FREE_GENERATIONS,
    remaining: paidRemaining + freeRemaining,
    verified,
  };
}

/**
 * Use `amount` generations.
 *
 * Free tier is standard-spec only (720p/5s/x1 — creditsForGeneration() === 1
 * by construction). So:
 *   - amount === 1: free-first, then paid (unchanged historical behavior).
 *   - amount > 1: PAID ONLY — never dips into free tier, even when free
 *     alone would cover it. Fails entirely (no partial charge) if paid can't
 *     cover it. This also means a single call can no longer "span" free and
 *     paid pools — spanning only ever happened for amount > 1, which is now
 *     paid-exclusive by design.
 *
 * KV is not transactional (check-then-write), so two concurrent requests for
 * the same email could both read a stale balance and both succeed, over-
 * spending by a few credits. Benign race: worst case is a slightly under-
 * charged customer, not data corruption. Not worth a locking scheme.
 */
export async function consumeCredits(
  email: string,
  jobId: string,
  amount: number,
): Promise<{ success: boolean; usedFree: number; usedPaid: number }> {
  const norm = normalize(email);

  // Admins: always succeed, no deduction
  if (isAdmin(norm)) {
    return { success: true, usedFree: 0, usedPaid: 0 };
  }

  const record = await getCreditRecord(norm);
  const paidRemaining = record.total - record.used;

  if (amount > 1) {
    // Non-standard-spec generation: paid only, free tier is never touched.
    if (paidRemaining < amount) {
      return { success: false, usedFree: 0, usedPaid: 0 };
    }
    record.used += amount;
    await saveCreditRecord(norm, record);
    return { success: true, usedFree: 0, usedPaid: amount };
  }

  const free = await getFreeRecord(norm);
  const freeRemaining = Math.max(0, FREE_GENERATIONS - free.used);

  if (freeRemaining + paidRemaining < amount) {
    return { success: false, usedFree: 0, usedPaid: 0 };
  }

  const usedFree = Math.min(freeRemaining, amount);
  const usedPaid = amount - usedFree;

  if (usedFree > 0) {
    free.used += usedFree;
    free.jobs = [...(free.jobs || []), jobId];
    await saveFreeRecord(norm, free);
  }

  if (usedPaid > 0) {
    record.used += usedPaid;
    await saveCreditRecord(norm, record);
  }

  return { success: true, usedFree, usedPaid };
}

/**
 * Reverse a previous consumeCredits() result exactly — decrements free.used /
 * record.used by the same usedFree/usedPaid amounts that were consumed.
 *
 * Internal compensating action for routes that must deduct credits BEFORE
 * attempting external task creation (e.g. quick-generate's per-segment loop)
 * and need to give the credit back when that creation throws. Only ever
 * touches `.used` fields (never `.total` or free tier's fixed cap), and
 * floors at 0 — so even if called with amounts exceeding what was actually
 * consumed, the result is bounded by the pre-existing free/paid caps and can
 * never mint credits beyond them.
 */
export async function refundCredits(
  email: string,
  jobId: string,
  usedFree: number,
  usedPaid: number,
): Promise<void> {
  const norm = normalize(email);

  if (usedFree <= 0 && usedPaid <= 0) return;
  if (isAdmin(norm)) return; // admins never had anything deducted

  const [free, record] = await Promise.all([getFreeRecord(norm), getCreditRecord(norm)]);

  if (usedFree > 0) {
    free.used = Math.max(0, free.used - usedFree);
    free.jobs = (free.jobs || []).filter(j => j !== jobId);
    await saveFreeRecord(norm, free);
  }

  if (usedPaid > 0) {
    record.used = Math.max(0, record.used - usedPaid);
    await saveCreditRecord(norm, record);
  }
}

/**
 * Use 1 generation. Checks free tier first, then paid credits.
 * Returns { success, usedFree } — success=false if no generations available.
 */
export async function consumeCredit(
  email: string,
  jobId: string,
): Promise<{ success: boolean; usedFree: boolean }> {
  const result = await consumeCredits(email, jobId, 1);
  return { success: result.success, usedFree: result.usedFree > 0 };
}

/**
 * Add generations after a successful payment.
 * Idempotent: rejects duplicate purchase IDs.
 */
export async function addCredits(
  email: string,
  credits: number,
  purchase: PurchaseRecord,
): Promise<{ added: boolean; record: CreditRecord }> {
  const norm = normalize(email);
  const record = await getCreditRecord(norm);

  // Idempotency: skip if this purchase was already recorded
  if (record.purchases.some(p => p.id === purchase.id)) {
    return { added: false, record };
  }

  record.total += credits;
  record.purchases.push(purchase);
  await saveCreditRecord(norm, record);
  return { added: true, record };
}

// Legacy exports for backward compatibility with tests
export { FREE_GENERATIONS };
