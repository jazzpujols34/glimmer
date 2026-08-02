/**
 * Server-side auth gate for every /api/admin/* route.
 * Two independent factors, both required:
 *  1. `email` (client-supplied, as today) must be in ADMIN_EMAILS (isAdmin()).
 *  2. The request must carry the server-only ADMIN_SECRET via the
 *     `x-admin-secret` header — a value the client cannot guess or derive.
 * Fails closed: if ADMIN_SECRET is unset/empty, every request is denied.
 */

import { NextRequest } from 'next/server';
import { errorResponse } from './api-response';
import { isAdmin } from './credits';

/**
 * Constant-time string comparison. Always walks the full length of the
 * longer input — no early-exit `===` that would leak timing information
 * about how many leading characters of a guessed secret were correct.
 * Exported for reuse by other secret/signature comparisons (e.g. ecpay.ts's
 * CheckMacValue verification) — do not replace with `===` at any call site.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length, 1);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Guard an admin route. Returns an error Response to send back when the
 * request is denied, or null when it's allowed to proceed.
 * The denial message is intentionally generic — it never reveals whether
 * the email, the secret, or the missing server config was the failure.
 */
export function requireAdmin(request: NextRequest, email: string | null | undefined): Response | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');
  }

  if (!email || !isAdmin(email)) {
    return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const provided = request.headers.get('x-admin-secret') || '';
  if (!provided || !constantTimeEqual(provided, secret)) {
    return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');
  }

  return null;
}
