/**
 * Identity resolver for progressive Google identity (Phase 1 — dormant).
 *
 * Proves the credit-key bridge (docs/oauth-identity-design.html §4) works
 * end-to-end without changing any live route's behavior: resolveIdentity()
 * is exported and unit-tested here, but Phase 1 wires it into NOTHING —
 * every generation/gallery/credits route still resolves identity by the
 * client-typed email exactly as before. Phase 2 is what starts calling this.
 */

import { getSession } from './session';
import { kvGet } from './kv';

interface RequestLike {
  headers: { get(name: string): string | null };
}

/**
 * Resolve the caller's identity: a signed session (if present) wins,
 * resolved through submap:<sub> -> email (written at Google sign-in,
 * see the OAuth callback route) so credits stay keyed to the email the
 * account already had, not the Google sub. If the map hasn't been written
 * yet (shouldn't normally happen — it's set at sign-in) or the session
 * exists but is otherwise unmapped, fall back to the session's own email
 * claim. With no session at all, returns `fallbackEmail` — today's
 * anonymous client-typed-email behavior, unchanged.
 */
export async function resolveIdentity(
  request: RequestLike,
  fallbackEmail?: string,
): Promise<string | undefined> {
  const session = await getSession(request);
  if (!session) return fallbackEmail;

  const mappedEmail = await kvGet(`submap:${session.sub}`);
  return mappedEmail || session.email;
}
