/**
 * Email magic-link login — the non-Google half of progressive identity.
 *
 * Sessions could previously only come from "Sign in with Google", so an email
 * user had no way to obtain one. That mattered more than it looked: Phase 2b
 * enforcement arms per account the first time that account establishes a
 * session (`sessionreq:<email>`), so an account that can never sign in can
 * never be protected either. On 2026-08-03 prod held zero `sessionreq` keys —
 * enforcement was live and guarding nobody, including a paying customer's
 * balance.
 *
 * The emailed link already exists (`/api/verify/send` -> `/api/verify/confirm`).
 * This module carries the one distinction that flow now needs: what the link
 * is FOR.
 *
 *   'verify' — the original first-time email check. Behaviour is unchanged:
 *              mark verified, no arming. A brand-new user who opens the link
 *              in their mail app's in-app browser must not come back to a
 *              tab that has started refusing to generate.
 *   'login'  — an explicit "send me a login link". This one arms the account,
 *              because the person asking for it is asking to be protected.
 *
 * Both issue a session cookie to the browser that clicked; only 'login' writes
 * the marker that makes typed-email spend refuse without one.
 */

/** What an emailed link is for. */
export type LinkPurpose = 'verify' | 'login';

/** Shape stored under `verify:<token>` in KV. */
export interface VerifyTokenRecord {
  email: string;
  createdAt: string;
  purpose?: LinkPurpose;
}

/**
 * Narrow untrusted input to a purpose. Anything unrecognised — including a
 * token minted before this field existed — is 'verify', the non-arming
 * behaviour that predates magic-link. Defaulting the other way would arm
 * accounts off malformed input.
 */
export function parseLinkPurpose(value: unknown): LinkPurpose {
  return value === 'login' ? 'login' : 'verify';
}

/** True when clicking this link should write `sessionreq:<email>`. */
export function shouldArmSession(purpose: LinkPurpose): boolean {
  return purpose === 'login';
}

/**
 * Stable session `sub` for an email login.
 *
 * Google subs are opaque numeric strings, so email logins need their own
 * namespace or the two could collide and one identity would resolve to the
 * other's credits. Deriving it from the normalised email (rather than
 * randomising per link) keeps a user's `sub` stable across logins, so
 * `submap:<sub>` stays meaningful if they later link accounts.
 */
export function emailSub(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

/** True for a sub minted by this module rather than by Google. */
export function isEmailSub(sub: string): boolean {
  return sub.startsWith('email:');
}
