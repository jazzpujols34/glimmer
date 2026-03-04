/**
 * Edge-compatible rate limiter using Cloudflare KV.
 * Falls back to in-memory Map for local dev.
 *
 * Strategy: Sliding window counter per IP.
 * Each window is 1 minute. We track request count per IP per window.
 */

import { getKV } from './kv';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp (seconds)
}

// In-memory fallback for local dev
const memRateMap = new Map<string, { count: number; windowStart: number }>();

/**
 * Check and increment rate limit for an identifier (typically IP).
 * @param identifier - The IP address or user identifier
 * @param maxRequests - Maximum requests per window (default: 20 for general, 5 for generate)
 * @param windowSeconds - Window duration in seconds (default: 60)
 */
export async function checkRateLimit(
  identifier: string,
  maxRequests: number = 20,
  windowSeconds: number = 60,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const key = `rl:${identifier}:${windowStart}`;
  const resetAt = windowStart + windowSeconds;

  const kv = await getKV();

  if (kv) {
    // KV-based (production)
    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;

    if (count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    await kv.put(key, String(count + 1), { expirationTtl: windowSeconds * 2 });
    return { allowed: true, remaining: maxRequests - count - 1, resetAt };
  }

  // In-memory fallback (local dev)
  const entry = memRateMap.get(key);
  if (entry && entry.windowStart === windowStart) {
    if (entry.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }
    entry.count++;
    return { allowed: true, remaining: maxRequests - entry.count, resetAt };
  }

  // New window
  memRateMap.set(key, { count: 1, windowStart });
  // Cleanup old entries
  for (const [k, v] of memRateMap) {
    if (v.windowStart < windowStart - windowSeconds) {
      memRateMap.delete(k);
    }
  }
  return { allowed: true, remaining: maxRequests - 1, resetAt };
}

/**
 * Get client IP from request headers (Cloudflare, proxies, direct).
 */
export function getClientIP(request: Request): string {
  return (
    (request.headers.get('cf-connecting-ip')) ||
    (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()) ||
    (request.headers.get('x-real-ip')) ||
    'unknown'
  );
}
