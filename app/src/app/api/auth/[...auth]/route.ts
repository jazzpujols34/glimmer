export const runtime = 'edge';

/**
 * Progressive Google identity — OAuth + session endpoints (Phase 2a: the
 * client now syncs its active identity from this route; see
 * src/components/SessionIdentitySync.tsx). One catch-all route to net the
 * function count back to zero after retiring /api/access in Step 0 (each
 * Pages Function costs ~320 KiB fixed overhead — see CLAUDE.md Recent
 * Learnings). Dispatches on the path segment:
 *
 *   GET  /api/auth/login/google     — start the OAuth+PKCE flow
 *   GET  /api/auth/callback/google  — exchange code, mint session, bridge KV,
 *                                      mark the account session-established
 *                                      (sessionreq:<email>, Phase 2b)
 *   GET  /api/auth/session          — { authenticated, email? } resolved
 *                                      through the credit-key bridge
 *   GET  /api/auth/logout           — clear session, redirect to /
 *   POST /api/auth/logout           — clear session, 200 json
 *
 * Server-side enforcement (Phase 2b, src/lib/identity.ts enforceIdentity())
 * is wired into the spend/destructive routes but ships DORMANT behind
 * REQUIRE_SESSION_FOR_PAID — see docs/oauth-identity-design.html.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errors, successResponse } from '@/lib/api-response';
import { kvPut, kvGet } from '@/lib/kv';
import { captureError } from '@/lib/errors';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { resolveIdentity } from '@/lib/identity';
import {
  signSession,
  sessionCookieHeader,
  clearSessionCookieHeader,
  getSession,
  signShortLived,
  verifyShortLived,
  getCookie,
  base64UrlEncode,
  base64UrlDecode,
} from '@/lib/session';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const STATE_COOKIE = 'glimmer_oauth_state';
export const PKCE_COOKIE = 'glimmer_oauth_pkce';
const SHORT_LIVED_TTL_SECONDS = 5 * 60; // 5 minutes

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://glimmer.video';
}

function redirectUri(): string {
  return `${appUrl()}/api/auth/callback/google`;
}

/** Only allow same-origin path redirects — never an absolute/protocol-relative URL. */
function safeReturnTo(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('://')) return '/';
  return value;
}

function shortLivedCookieHeader(name: string, value: string): string {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SHORT_LIVED_TTL_SECONDS}`;
}

function clearShortLivedCookieHeader(name: string): string {
  return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

async function randomBase64Url(byteLength: number): Promise<string> {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64UrlEncode(new Uint8Array(digest));
}

interface GoogleIdTokenPayload {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  exp?: number;
}

/**
 * Decode (NOT verify-signature) the id_token payload. Safe because this
 * token came directly from Google's token endpoint over TLS in the same
 * request we just made — there is no untrusted third party in the middle to
 * forge it. We still validate the claims Google put in it (aud/iss/exp/
 * email_verified) below.
 */
function decodeIdTokenPayload(idToken: string): GoogleIdTokenPayload | null {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = new TextDecoder().decode(base64UrlDecode(parts[1]));
    return JSON.parse(json) as GoogleIdTokenPayload;
  } catch {
    return null;
  }
}

// --- GET /api/auth/login/google ---

async function handleLoginGoogle(request: NextRequest): Promise<NextResponse> {
  // --- Rate limiting (20 login attempts per 5 min per IP) ---
  const ip = getClientIP(request);
  const rateCheck = await checkRateLimit(`auth:login:${ip}`, 20, 300);
  if (!rateCheck.allowed) {
    const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
    return errors.rateLimited(retryAfter);
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    captureError(new Error('GOOGLE_OAUTH_CLIENT_ID is not set'), { route: '/api/auth/login/google' });
    return errors.serverError();
  }

  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));
  const nonce = await randomBase64Url(24);
  const codeVerifier = await randomBase64Url(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  // The exact string sent as `state` to Google is also what we sign into the
  // state cookie — the callback accepts the flow only if both match, which
  // also lets returnTo travel through Google's redirect without a 3rd cookie.
  const state = JSON.stringify({ nonce, returnTo });
  const signedState = await signShortLived(state, SHORT_LIVED_TTL_SECONDS);
  const signedVerifier = await signShortLived(codeVerifier, SHORT_LIVED_TTL_SECONDS);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const res = NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302);
  res.headers.append('Set-Cookie', shortLivedCookieHeader(STATE_COOKIE, signedState));
  res.headers.append('Set-Cookie', shortLivedCookieHeader(PKCE_COOKIE, signedVerifier));
  return res;
}

// --- GET /api/auth/callback/google ---

async function handleCallbackGoogle(request: NextRequest): Promise<NextResponse> {
  // --- Rate limiting (20 callback hits per 5 min per IP — each one makes an
  // outbound Google token-exchange call, so this also caps that outbound cost) ---
  const ip = getClientIP(request);
  const rateCheck = await checkRateLimit(`auth:callback:${ip}`, 20, 300);
  if (!rateCheck.allowed) {
    const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
    return errors.rateLimited(retryAfter);
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    captureError(new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET not set'), { route: '/api/auth/callback/google' });
    return errors.serverError();
  }

  const code = request.nextUrl.searchParams.get('code');
  const stateParam = request.nextUrl.searchParams.get('state');
  const cookieState = await verifyShortLived(getCookie(request, STATE_COOKIE));
  const codeVerifier = await verifyShortLived(getCookie(request, PKCE_COOKIE));

  if (!code || !stateParam || !cookieState || stateParam !== cookieState || !codeVerifier) {
    return errors.invalidInput('登入驗證已過期或無效，請重新登入');
  }

  let returnTo = '/';
  try {
    const parsed = JSON.parse(cookieState) as { returnTo?: string };
    returnTo = safeReturnTo(parsed.returnTo ?? null);
  } catch {
    returnTo = '/';
  }

  let tokenRes: Response;
  try {
    tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(),
      }).toString(),
    });
  } catch (error) {
    captureError(error, { route: '/api/auth/callback/google' });
    return errors.serverError();
  }

  if (!tokenRes.ok) {
    captureError(new Error(`Google token exchange failed: ${tokenRes.status}`), {
      route: '/api/auth/callback/google',
    });
    return errors.serverError();
  }

  const tokenData = (await tokenRes.json()) as { id_token?: string };
  if (!tokenData.id_token) {
    captureError(new Error('Google token response missing id_token'), { route: '/api/auth/callback/google' });
    return errors.serverError();
  }

  const payload = decodeIdTokenPayload(tokenData.id_token);
  const now = Math.floor(Date.now() / 1000);

  if (
    !payload ||
    payload.aud !== clientId ||
    (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') ||
    typeof payload.exp !== 'number' ||
    payload.exp <= now ||
    !payload.sub ||
    !payload.email ||
    payload.email_verified !== true
  ) {
    return errors.invalidInput('Google 登入驗證失敗');
  }

  const sub = payload.sub;
  const email = payload.email.toLowerCase().trim();

  // Credit-key bridge: future logins from this Google account resolve the
  // same identity via submap:<sub> -> email (see src/lib/identity.ts, Step 3).
  //
  // Write-once, never overwrite. The whole point of the bridge is that a
  // Google login can resolve to an account keyed by a DIFFERENT email — the
  // credits were bought under the address the customer already used, which
  // needn't be their Google address. Re-writing it on every sign-in destroys
  // exactly that: on 2026-08-03 a second sign-in overwrote a deliberate
  // sub -> ro5112@hotmail.com bridge with the Google address, and a session
  // holding 114 credits started resolving to an account with none.
  const existingBridge = await kvGet(`submap:${sub}`);
  if (!existingBridge) {
    await kvPut(`submap:${sub}`, email);
  }

  // Phase 2b auto-migrate marker: this account has now established a
  // session. Persistent, no TTL — enforceIdentity() (src/lib/identity.ts)
  // only refuses typed-email spend/delete access for emails that have this
  // key, so an account that never signs in is never affected by flipping
  // REQUIRE_SESSION_FOR_PAID on later.
  await kvPut(`sessionreq:${email}`, '1');

  const sessionToken = await signSession({ sub, email });

  const res = NextResponse.redirect(`${appUrl()}${returnTo}`, 302);
  res.headers.append('Set-Cookie', sessionCookieHeader(sessionToken));
  res.headers.append('Set-Cookie', clearShortLivedCookieHeader(STATE_COOKIE));
  res.headers.append('Set-Cookie', clearShortLivedCookieHeader(PKCE_COOKIE));
  return res;
}

// --- GET /api/auth/session ---

async function handleSession(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return successResponse({ authenticated: false });
  // Resolved through the submap:<sub> credit-key bridge (src/lib/identity.ts)
  // so the client gets the credit-bearing email, not just the session's raw
  // claim — a session always resolves to a string here, never the fallback.
  const email = await resolveIdentity(request);
  return successResponse({ authenticated: true, email });
}

// --- GET/POST /api/auth/logout ---

function handleLogout(request: NextRequest): NextResponse {
  if (request.method === 'POST') {
    const res = successResponse();
    res.headers.append('Set-Cookie', clearSessionCookieHeader());
    return res;
  }
  const res = NextResponse.redirect(`${appUrl()}/`, 302);
  res.headers.append('Set-Cookie', clearSessionCookieHeader());
  return res;
}

// --- Dispatcher ---

async function dispatch(request: NextRequest, path: string): Promise<NextResponse> {
  switch (path) {
    case 'login/google':
      return request.method === 'GET' ? handleLoginGoogle(request) : errors.notFound('路徑');
    case 'callback/google':
      return request.method === 'GET' ? handleCallbackGoogle(request) : errors.notFound('路徑');
    case 'session':
      return request.method === 'GET' ? handleSession(request) : errors.notFound('路徑');
    case 'logout':
      return request.method === 'GET' || request.method === 'POST'
        ? handleLogout(request)
        : errors.notFound('路徑');
    default:
      return errors.notFound('路徑');
  }
}

async function handle(request: NextRequest, params: Promise<{ auth: string[] }>): Promise<NextResponse> {
  const { auth } = await params;
  const path = (auth || []).join('/');
  try {
    return await dispatch(request, path);
  } catch (error) {
    captureError(error, { route: `/api/auth/${path}` });
    return errors.serverError();
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ auth: string[] }> }) {
  return handle(request, params);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ auth: string[] }> }) {
  return handle(request, params);
}
