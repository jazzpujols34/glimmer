/**
 * Pure decision logic for Concern 2 of progressive Google identity
 * (Phase 2a — docs/oauth-identity-design.html): should the client's active
 * `glimmer_email` be promoted to the signed-in session's resolved identity?
 * Kept out of the React component (SessionIdentitySync.tsx) so it's
 * unit-testable under this repo's node-environment vitest setup, which has
 * no DOM/component-rendering harness.
 */

interface SessionResponse {
  authenticated?: boolean;
  email?: string;
}

/**
 * Returns the email that should become the active `glimmer_email`, or null
 * if nothing should change: no session, a session response with no resolved
 * email, or an email that already matches what's stored. An anonymous
 * (unauthenticated) session never writes — this only ever promotes a
 * signed-in identity, never clears one.
 */
export function resolveSyncedEmail(
  session: SessionResponse | null | undefined,
  storedEmail: string | null,
): string | null {
  if (!session?.authenticated || !session.email) return null;
  if (session.email === storedEmail) return null;
  return session.email;
}
