/**
 * Ownership helpers for per-user API routes.
 * Identity in this app is email-only (localStorage, no sessions) — client-supplied
 * email is knowingly spoofable, but it closes the anonymous-enumeration hole where
 * routes returned/mutated every user's data with no requester identity at all.
 */

import { isValidEmail } from './validation';
import { isAdmin } from './credits';

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
