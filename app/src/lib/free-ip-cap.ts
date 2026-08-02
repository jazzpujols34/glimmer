/**
 * Per-IP monthly cap on free-tier generations.
 *
 * A single inbox can't farm unlimited free tiers thanks to canonicalFreeTierEmail
 * (see credits.ts), but a single network/NAT can still spin up many DISTINCT
 * emails to keep re-triggering the free tier. This caps free-tier consumption
 * per IP per calendar month — deliberately generous (paid customers behind a
 * shared IP — cafes, offices, campus NAT — must not be blocked), catching
 * only obvious IP-level abuse.
 *
 * No env var: this is an anti-abuse guardrail, not a pricing lever.
 */

import { kvGet, kvPut } from './kv';

export const FREE_IP_MONTHLY_CAP = 6;

const FREE_IP_PREFIX = 'freeip:';
const TTL_SECONDS = 45 * 24 * 60 * 60; // 45 days — covers a full calendar month plus buffer

function monthKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function ipCapKey(ip: string, date: Date = new Date()): string {
  return `${FREE_IP_PREFIX}${monthKey(date)}:${ip}`;
}

function isKnownIp(ip: string): boolean {
  return Boolean(ip) && ip !== 'unknown';
}

/**
 * Check whether this IP has hit the monthly free-tier cap.
 * Fail-open: an unknown/empty IP is always allowed (never block a paying
 * customer path on a missing/stripped header).
 */
export async function checkFreeIpCap(ip: string): Promise<{ allowed: boolean; count: number }> {
  if (!isKnownIp(ip)) {
    return { allowed: true, count: 0 };
  }
  const raw = await kvGet(ipCapKey(ip));
  const count = raw ? parseInt(raw, 10) : 0;
  return { allowed: count < FREE_IP_MONTHLY_CAP, count };
}

/**
 * Increment the monthly free-tier counter for this IP. Call ONLY after a
 * free credit was actually consumed (never speculatively, never for paid
 * generations) — a no-op for unknown/empty IPs so we never create a shared
 * "unknown" bucket that could wrongly cap real IPs.
 */
export async function recordFreeIpUsage(ip: string): Promise<void> {
  if (!isKnownIp(ip)) return;
  const key = ipCapKey(ip);
  const raw = await kvGet(key);
  const count = raw ? parseInt(raw, 10) : 0;
  await kvPut(key, String(count + 1), { expirationTtl: TTL_SECONDS });
}
