/**
 * Identity resolver for progressive Google identity.
 *
 * Phase 1 proved the credit-key bridge (docs/oauth-identity-design.html §4)
 * works end-to-end without changing any live route's behavior:
 * resolveIdentity() is exported and unit-tested here, but wired into
 * nothing — every generation/gallery/credits route still resolves identity
 * by the client-typed email exactly as before.
 *
 * Phase 2b adds enforceIdentity() — the spend/delete gate, shipped DORMANT
 * behind `REQUIRE_SESSION_FOR_PAID` (see docs/oauth-identity-design.html §5,
 * §6). With the flag off/unset it is a pure no-op: every wired route stays
 * byte-identical to pre-Phase-2b behavior. With the flag on, an account only
 * becomes session-required once it has actually signed in at least once
 * (`sessionreq:<email>`, written at OAuth callback — see
 * src/app/api/auth/[...auth]/route.ts) — so a legacy/never-signed-in email
 * is never locked out by flipping the flag.
 */

import { getSession } from './session';
import { kvGet } from './kv';
import { normalize } from './credits';
import { isValidEmail } from './validation';

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

/**
 * Spend/delete gate for Phase 2b (dormant unless REQUIRE_SESSION_FOR_PAID=true).
 *
 *   - Flag off/unset: pure no-op, always `{ email: clientEmail }` — this is
 *     the guarantee that every wired route stays byte-identical to today
 *     when the flag isn't set.
 *   - Flag on + valid session: the session wins, resolved through the same
 *     submap bridge as resolveIdentity() — the client-supplied email is
 *     IGNORED, closing the spoof.
 *   - Flag on + no session: falls back to `clientEmail`, UNLESS that email
 *     has previously established a session (`sessionreq:<email>` written at
 *     OAuth sign-in), in which case typed-email access is refused —
 *     `{ error: 'SESSION_REQUIRED' }`. An email that has never signed in has
 *     no `sessionreq` entry and keeps working exactly as before (auto-migrate:
 *     only accounts that opted in by signing in are ever locked out).
 */
export async function enforceIdentity(
  request: RequestLike,
  clientEmail: string,
): Promise<{ email: string } | { error: 'SESSION_REQUIRED' }> {
  if (process.env.REQUIRE_SESSION_FOR_PAID !== 'true') {
    return { email: clientEmail };
  }

  const session = await getSession(request);
  if (session) {
    // A session is present, so resolveIdentity() always resolves through it
    // (submap -> mapped email, or the session's own email claim) — the
    // fallback below is defensive only, never actually reached.
    const resolvedEmail = await resolveIdentity(request, clientEmail);
    return { email: resolvedEmail ?? clientEmail };
  }

  const bound = await kvGet(`sessionreq:${normalize(clientEmail)}`);
  if (bound) {
    return { error: 'SESSION_REQUIRED' };
  }

  return { email: clientEmail };
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
 * Delegates the rules to enforceIdentity() rather than restating them, so
 * reads and spends can never drift on what counts as identity. Reads add one
 * rule of their own: a session ALONE identifies the caller, so a signed-in
 * client need not also pass `?email=`.
 *
 * Deliberately lives here rather than in owner.ts. owner.ts is imported by 12
 * route files but only three need identity, and putting this there dragged
 * session+identity into every one of them — enough to push the Pages Functions
 * bundle over the 25 MiB deploy limit and fail the build outright.
 */
export async function resolveReaderEmail(request: ReaderRequest): Promise<ReaderResolution> {
  const raw = new URL(request.url).searchParams.get('email');
  const clientEmail = raw && isValidEmail(raw.toLowerCase().trim())
    ? raw.toLowerCase().trim()
    : null;

  if (!clientEmail) {
    if (process.env.REQUIRE_SESSION_FOR_PAID === 'true') {
      const sessionEmail = await resolveIdentity(request);
      if (sessionEmail) return { email: sessionEmail };
    }
    // Distinguish "you sent nothing" from "you sent junk" — the existing
    // routes return different errors for these and callers depend on it.
    return { error: raw ? 'INVALID' : 'MISSING' };
  }

  const enforced = await enforceIdentity(request, clientEmail);
  if ('error' in enforced) return { error: 'SESSION_REQUIRED' };
  return { email: enforced.email };
}
