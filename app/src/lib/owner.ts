/**
 * Ownership helpers for per-user API routes.
 * Identity in this app is email-only (localStorage, no sessions) — client-supplied
 * email is knowingly spoofable, but it closes the anonymous-enumeration hole where
 * routes returned/mutated every user's data with no requester identity at all.
 */

import { isValidEmail } from './validation';
import { isAdmin } from './credits';
import { enforceIdentity, resolveIdentity } from './identity';

/**
 * Reads `?email=` from the request URL, normalizes it (lowercase + trim),
 * and validates it. Returns null if the param is absent or not a valid email.
 */
export function getRequesterEmail(request: { url: string }): string | null {
  const raw = new URL(request.url).searchParams.get('email');
  if (!raw) return null;
  const normalized = raw.toLowerCase().trim();
  if (!isValidEmail(normalized)) return null;
  return normalized;
}

/**
 * True when the requester is an admin, or the resource's email matches the
 * requester's (case/whitespace-insensitive). A resource with no email field
 * is owned by nobody — only admins may touch it.
 */
export function ownsOrAdmin(resourceEmail: string | undefined, requesterEmail: string): boolean {
  if (isAdmin(requesterEmail)) return true;
  if (!resourceEmail) return false;
  return resourceEmail.toLowerCase().trim() === requesterEmail.toLowerCase().trim();
}

/** Outcome of identifying the caller of a read/list route. */
export type ReaderResolution =
  | { email: string }
  | { error: 'MISSING' | 'INVALID' | 'SESSION_REQUIRED' };

interface ReaderRequest {
  url: string;
  headers: { get(name: string): string | null };
}

/**
 * Identify the caller of a read/list route, with Phase 2b enforcement applied.
 *
 * Spend and destructive routes have gone through enforceIdentity() since Phase
 * 2b; reads did not, so `?email=` alone still decided whose gallery, projects
 * and storyboards you saw. The July 2026 ownership fix closed anonymous
 * enumeration (you must name an email), but naming a known address was still
 * enough to list that person's videos.
 *
 * Delegates the actual rules to enforceIdentity() rather than restating them,
 * so reads and spends can never drift apart on what counts as identity:
 * flag off is a pure no-op, a valid session beats the query string, and an
 * account that has armed enforcement is refused typed-email access.
 *
 * The one thing reads add is that a session ALONE identifies the caller —
 * a signed-in client need not also pass `?email=`.
 */
export async function resolveReaderEmail(request: ReaderRequest): Promise<ReaderResolution> {
  const clientEmail = getRequesterEmail(request);

  if (!clientEmail) {
    if (process.env.REQUIRE_SESSION_FOR_PAID === 'true') {
      const sessionEmail = await resolveIdentity(request);
      if (sessionEmail) return { email: sessionEmail };
    }
    // Distinguish "you sent nothing" from "you sent junk" — the existing
    // routes return different errors for these and callers depend on it.
    return { error: new URL(request.url).searchParams.get('email') ? 'INVALID' : 'MISSING' };
  }

  const enforced = await enforceIdentity(request, clientEmail);
  if ('error' in enforced) return { error: 'SESSION_REQUIRED' };
  return { email: enforced.email };
}
