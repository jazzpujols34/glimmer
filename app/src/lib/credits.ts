/**
 * Credit system: email-based credit tracking for pay-per-video model.
 * Uses shared KV abstraction from kv.ts. Credits never expire (no TTL).
 */

import { kvGet, kvPut } from './kv';
import type { CreditBalance, CreditRecord, PurchaseRecord, FreeRecord } from '@/types';

const CREDIT_PREFIX = 'credits:';
const FREE_PREFIX = 'free:';

// --- Email helpers ---

function normalize(email: string): string {
  return email.toLowerCase().trim();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// --- Credit Record CRUD ---

async function getCreditRecord(email: string): Promise<CreditRecord> {
  const data = await kvGet(`${CREDIT_PREFIX}${normalize(email)}`);
  if (data) return JSON.parse(data);
  return { total: 0, used: 0, freeUsed: false, purchases: [] };
}

async function saveCreditRecord(email: string, record: CreditRecord): Promise<void> {
  // No expirationTtl — credits persist indefinitely
  await kvPut(`${CREDIT_PREFIX}${normalize(email)}`, JSON.stringify(record));
}

// --- Free Tier CRUD ---

async function getFreeRecord(email: string): Promise<FreeRecord> {
  const data = await kvGet(`${FREE_PREFIX}${normalize(email)}`);
  if (data) return JSON.parse(data);
  return { used: false };
}

async function saveFreeRecord(email: string, record: FreeRecord): Promise<void> {
  await kvPut(`${FREE_PREFIX}${normalize(email)}`, JSON.stringify(record));
}

// --- Public API ---

/** Check credit balance for an email address. */
export async function checkCredits(email: string): Promise<CreditBalance> {
  const norm = normalize(email);
  const record = await getCreditRecord(norm);
  const free = await getFreeRecord(norm);
  const paidRemaining = record.total - record.used;
  const freeAvailable = free.used ? 0 : 1;

  return {
    email: norm,
    total: record.total,
    used: record.used,
    freeUsed: free.used,
    remaining: paidRemaining + freeAvailable,
  };
}

/**
 * Use 1 credit for a generation. Checks free tier first, then paid credits.
 * Returns { success, usedFree } — success=false if no credits available.
 */
export async function useCredit(
  email: string,
  jobId: string,
): Promise<{ success: boolean; usedFree: boolean }> {
  const norm = normalize(email);

  // Try free tier first
  const free = await getFreeRecord(norm);
  if (!free.used) {
    await saveFreeRecord(norm, { used: true, jobId, usedAt: new Date().toISOString() });
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
 * Add credits after a successful Stripe payment.
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
