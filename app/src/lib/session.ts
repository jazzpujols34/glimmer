/**
 * Signed session cookie for progressive Google identity (Phase 1 — dormant,
 * see docs/oauth-identity-design.html). Edge-safe: Web Crypto HMAC-SHA256,
 * same primitive already used for Kling's JWT (src/lib/veo.ts) — no jose/
 * jsonwebtoken dependency.
 *
 * Token shape: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
 * Session payload: { sub, email, iat, exp } — 30-day expiry.
 *
 * Nothing in the app calls getSession() yet outside this module's own tests
 * and identity.ts (also dormant) — Phase 1 is additive only.
 */

export const SESSION_COOKIE_NAME = 'glimmer_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days = 2592000

export interface SessionClaims {
  sub: string;
  email: string;
}

interface SignedEnvelope {
  exp: number;
  [key: string]: unknown;
}

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Sign an arbitrary JSON-serializable envelope (must include `exp`). */
async function sign(payload: SignedEnvelope): Promise<string> {
  const encoder = new TextEncoder();
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await getHmacKey(requireSecret());
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(sigBuffer))}`;
}

/**
 * Verify a token produced by sign(). Returns the decoded payload, or null if
 * the token is malformed, the signature doesn't match, SESSION_SECRET is
 * unset/wrong, or `exp` has passed. Fails closed on every error path.
 */
async function verify(token: string): Promise<SignedEnvelope | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;
  const encodedPayload = token.slice(0, dotIndex);
  const encodedSig = token.slice(dotIndex + 1);
  if (!encodedPayload || !encodedSig) return null;

  try {
    const encoder = new TextEncoder();
    const key = await getHmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(encodedSig),
      encoder.encode(encodedPayload),
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as SignedEnvelope;
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// --- Session token (30-day, {sub, email}) ---

export async function signSession(claims: SessionClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: claims.sub, email: claims.email, iat: now, exp: now + SESSION_TTL_SECONDS });
}

export async function verifySession(cookieValue: string | null | undefined): Promise<SessionClaims | null> {
  if (!cookieValue) return null;
  const payload = await verify(cookieValue);
  if (!payload) return null;
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
  return { sub: payload.sub, email: payload.email };
}

/** `Set-Cookie` value for a fresh session. */
export function sessionCookieHeader(value: string): string {
  return `${SESSION_COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

/** `Set-Cookie` value that clears the session cookie (logout). */
export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// --- Generic short-lived signed value (OAuth state / PKCE code_verifier cookies, Step 2) ---

export async function signShortLived(value: string, ttlSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ v: value, exp: now + ttlSeconds });
}

export async function verifyShortLived(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const payload = await verify(token);
  if (!payload || typeof payload.v !== 'string') return null;
  return payload.v;
}

// --- Cookie parsing ---

/** Read a single cookie by name from a request's Cookie header. */
export function getCookie(request: { headers: { get(name: string): string | null } }, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return part.slice(idx + 1).trim();
  }
  return null;
}

/** Resolve the caller's session from the request's Cookie header, or null. */
export async function getSession(request: { headers: { get(name: string): string | null } }): Promise<SessionClaims | null> {
  const raw = getCookie(request, SESSION_COOKIE_NAME);
  return verifySession(raw);
}
