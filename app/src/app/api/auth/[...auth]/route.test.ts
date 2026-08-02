import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// Mock the KV module before importing anything that (transitively) depends on it.
// Mirrors the pattern in src/lib/credits.test.ts / webhooks/ecpay/route.test.ts.
const mockStore = new Map<string, string>();

vi.mock('@/lib/kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  kvDelete: vi.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
  kvListKeys: vi.fn(() => Promise.resolve([])),
  getKV: vi.fn(() => Promise.resolve(null)),
}));

import { GET, POST, STATE_COOKIE, PKCE_COOKIE } from './route';
import { signShortLived, signSession, verifySession, SESSION_COOKIE_NAME } from '@/lib/session';

const ORIGINAL_ENV = { ...process.env };
const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

beforeEach(() => {
  mockStore.clear();
  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.GOOGLE_OAUTH_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://glimmer.video';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function buildRequest(path: string, opts: { cookie?: string; method?: string; ip?: string } = {}): NextRequest {
  const nextUrl = new URL(path, 'https://glimmer.video');
  const headerInit: Record<string, string> = {};
  if (opts.cookie) headerInit.cookie = opts.cookie;
  if (opts.ip) headerInit['cf-connecting-ip'] = opts.ip;
  return {
    nextUrl,
    url: nextUrl.toString(),
    method: opts.method || 'GET',
    headers: new Headers(headerInit),
  } as unknown as NextRequest;
}

function paramsFor(segments: string[]) {
  return Promise.resolve({ auth: segments });
}

function makeIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

function validIdTokenPayload(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-sub-abc123',
    email: 'Grieving@Example.com',
    email_verified: true,
    exp: now + 3600,
    ...overrides,
  };
}

/** Builds a callback request with real, signed state/pkce cookies — mirrors
 * what handleLoginGoogle would have set, so each test can perturb exactly
 * one piece (the query state, the cookie's content, etc). */
async function buildCallbackRequest(opts: {
  stateSentToGoogle?: string;
  cookieState?: string;
  codeVerifier?: string;
  code?: string | null;
  ip?: string;
}) {
  const realState = JSON.stringify({ nonce: 'test-nonce', returnTo: '/gallery' });
  const codeVerifier = opts.codeVerifier ?? 'test-code-verifier';

  const signedState = await signShortLived(opts.cookieState ?? realState, 300);
  const signedVerifier = await signShortLived(codeVerifier, 300);

  const code = opts.code === undefined ? 'auth-code-123' : opts.code;
  const search = new URLSearchParams();
  if (code !== null) search.set('code', code);
  search.set('state', opts.stateSentToGoogle ?? realState);

  return buildRequest(`/api/auth/callback/google?${search.toString()}`, {
    cookie: `${STATE_COOKIE}=${signedState}; ${PKCE_COOKIE}=${signedVerifier}`,
    ip: opts.ip,
  });
}

describe('GET /api/auth/login/google', () => {
  it('redirects to Google with PKCE + state, and sets both short-lived cookies', async () => {
    const res = await GET(buildRequest('/api/auth/login/google?returnTo=/gallery'), {
      params: paramsFor(['login', 'google']),
    });
    expect(res.status).toBe(302);

    const location = res.headers.get('location')!;
    expect(location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);

    const url = new URL(location);
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe('https://glimmer.video/api/auth/callback/google');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();

    const state = url.searchParams.get('state')!;
    expect(JSON.parse(state).returnTo).toBe('/gallery');

    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith(`${STATE_COOKIE}=`))).toBe(true);
    expect(setCookies.some((c) => c.startsWith(`${PKCE_COOKIE}=`))).toBe(true);
    expect(setCookies.every((c) => c.includes('HttpOnly') && c.includes('Secure'))).toBe(true);
  });

  it('rejects an off-origin returnTo, falling back to /', async () => {
    const res = await GET(buildRequest('/api/auth/login/google?returnTo=https://evil.example.com'), {
      params: paramsFor(['login', 'google']),
    });
    const location = res.headers.get('location')!;
    const state = new URL(location).searchParams.get('state')!;
    expect(JSON.parse(state).returnTo).toBe('/');
  });

  it('500s if GOOGLE_OAUTH_CLIENT_ID is unset (fail closed)', async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    const res = await GET(buildRequest('/api/auth/login/google'), { params: paramsFor(['login', 'google']) });
    expect(res.status).toBe(500);
  });

  it('rate-limits after 20 requests from the same IP within the window', async () => {
    const ip = '203.0.113.50';
    for (let i = 0; i < 20; i++) {
      const res = await GET(buildRequest('/api/auth/login/google', { ip }), {
        params: paramsFor(['login', 'google']),
      });
      expect(res.status).toBe(302);
    }

    const res = await GET(buildRequest('/api/auth/login/google', { ip }), {
      params: paramsFor(['login', 'google']),
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('RATE_LIMITED');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('GET /api/auth/callback/google', () => {
  it('valid state+code sets a session cookie and writes submap:<sub>', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id_token: makeIdToken(validIdTokenPayload()) }), { status: 200 }))
    );

    const req = await buildCallbackRequest({});
    const res = await GET(req, { params: paramsFor(['callback', 'google']) });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://glimmer.video/gallery');

    const setCookies = res.headers.getSetCookie();
    const sessionCookie = setCookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toContain('SameSite=Lax');

    const token = sessionCookie!.split(';')[0].split('=')[1];
    const claims = await verifySession(token);
    // email is lowercased even though Google's claim came back mixed-case
    expect(claims).toEqual({ sub: 'google-sub-abc123', email: 'grieving@example.com' });

    expect(mockStore.get('submap:google-sub-abc123')).toBe('grieving@example.com');

    // Phase 2b auto-migrate marker: this sign-in also marks the account
    // session-established (dormant unless REQUIRE_SESSION_FOR_PAID=true —
    // see src/lib/identity.ts enforceIdentity()).
    expect(mockStore.get('sessionreq:grieving@example.com')).toBe('1');

    // pkce/state cookies must be cleared on the way out
    const cleared = setCookies.filter((c) => c.includes('Max-Age=0'));
    expect(cleared.some((c) => c.startsWith(`${STATE_COOKIE}=`))).toBe(true);
    expect(cleared.some((c) => c.startsWith(`${PKCE_COOKIE}=`))).toBe(true);
  });

  it('mismatched state -> 400', async () => {
    const req = await buildCallbackRequest({
      stateSentToGoogle: JSON.stringify({ nonce: 'a-different-nonce', returnTo: '/' }),
    });
    const res = await GET(req, { params: paramsFor(['callback', 'google']) });
    expect(res.status).toBe(400);
  });

  it('id_token with wrong aud -> rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ id_token: makeIdToken(validIdTokenPayload({ aud: 'someone-elses-client-id' })) }),
        { status: 200 }
      ))
    );
    const req = await buildCallbackRequest({});
    const res = await GET(req, { params: paramsFor(['callback', 'google']) });
    expect(res.status).toBe(400);
    expect(mockStore.size).toBe(0);
  });

  it('email_verified:false -> rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ id_token: makeIdToken(validIdTokenPayload({ email_verified: false })) }),
        { status: 200 }
      ))
    );
    const req = await buildCallbackRequest({});
    const res = await GET(req, { params: paramsFor(['callback', 'google']) });
    expect(res.status).toBe(400);
    expect(mockStore.size).toBe(0);
  });

  it('missing code -> 400, never calls Google', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const req = await buildCallbackRequest({ code: null });
    const res = await GET(req, { params: paramsFor(['callback', 'google']) });
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Google token endpoint failure -> 500, no session minted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('error', { status: 400 })));
    const req = await buildCallbackRequest({});
    const res = await GET(req, { params: paramsFor(['callback', 'google']) });
    expect(res.status).toBe(500);
    expect(mockStore.size).toBe(0);
  });

  it('rate-limits after 20 requests from the same IP within the window', async () => {
    const ip = '203.0.113.60';
    // No code/state cookies — each request is rejected as invalid (400)
    // before ever reaching Google, but that happens AFTER the rate check,
    // so it still counts against the same-IP bucket.
    for (let i = 0; i < 20; i++) {
      const res = await GET(buildRequest('/api/auth/callback/google', { ip }), {
        params: paramsFor(['callback', 'google']),
      });
      expect(res.status).toBe(400);
    }

    const res = await GET(buildRequest('/api/auth/callback/google', { ip }), {
      params: paramsFor(['callback', 'google']),
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('RATE_LIMITED');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('GET /api/auth/session', () => {
  it('reports authenticated:false with no session cookie', async () => {
    const res = await GET(buildRequest('/api/auth/session'), { params: paramsFor(['session']) });
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('reports authenticated:true + the session email when there is no submap entry', async () => {
    const token = await signSession({ sub: 'sub-1', email: 'a@b.com' });
    const res = await GET(buildRequest('/api/auth/session', { cookie: `${SESSION_COOKIE_NAME}=${token}` }), {
      params: paramsFor(['session']),
    });
    expect(await res.json()).toEqual({ authenticated: true, email: 'a@b.com' });
  });

  it('reports the MAPPED email (not the session claim) when submap:<sub> resolves elsewhere', async () => {
    mockStore.set('submap:sub-mapped', 'credit-holder@example.com');
    const token = await signSession({ sub: 'sub-mapped', email: 'session-claim@example.com' });
    const res = await GET(buildRequest('/api/auth/session', { cookie: `${SESSION_COOKIE_NAME}=${token}` }), {
      params: paramsFor(['session']),
    });
    expect(await res.json()).toEqual({ authenticated: true, email: 'credit-holder@example.com' });
  });
});

describe('logout', () => {
  it('GET clears the session cookie and redirects to /', async () => {
    const res = await GET(buildRequest('/api/auth/logout'), { params: paramsFor(['logout']) });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://glimmer.video/');
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(cleared).toContain('Max-Age=0');
  });

  it('POST clears the session cookie and returns 200 json', async () => {
    const res = await POST(buildRequest('/api/auth/logout', { method: 'POST' }), { params: paramsFor(['logout']) });
    expect(res.status).toBe(200);
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(cleared).toContain('Max-Age=0');
  });
});

describe('unknown sub-path', () => {
  it('404s', async () => {
    const res = await GET(buildRequest('/api/auth/nope'), { params: paramsFor(['nope']) });
    expect(res.status).toBe(404);
  });
});
