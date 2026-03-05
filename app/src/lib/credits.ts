/**
 * Credit system: email-based generation tracking.
 * "Generation" = one AI video clip (5-12 sec)
 * "Video" = final edited product (made from multiple generations)
 *
 * Free tier: 10 generations per email
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

async function getFreeRecord(email: string): Promise<FreeRecord> {
  const data = await kvGet(`${FREE_PREFIX}${normalize(email)}`);
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
  await kvPut(`${FREE_PREFIX}${normalize(email)}`, JSON.stringify(record));
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
 * Use 1 generation. Checks free tier first, then paid credits.
 * Returns { success, usedFree } — success=false if no generations available.
 */
export async function consumeCredit(
  email: string,
  jobId: string,
): Promise<{ success: boolean; usedFree: boolean }> {
  const norm = normalize(email);

  // Admins: always succeed, no deduction
  if (isAdmin(norm)) {
    return { success: true, usedFree: false };
  }

  // Try free tier first
  const free = await getFreeRecord(norm);
  if (free.used < FREE_GENERATIONS) {
    free.used += 1;
    free.jobs = [...(free.jobs || []), jobId];
    await saveFreeRecord(norm, free);
    return { success: true, usedFree: true };
  }

  // Try paid credits
  const record = await getCreditRecord(norm);
  const remaining = record.total - record.used;
  if (remaining <= 0) {
    return { success: false, usedFree: false };
  }

  record.used += 1;
  await saveCreditRecord(norm, record);
  return { success: true, usedFree: false };
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
