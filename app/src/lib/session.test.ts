import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  signSession,
  verifySession,
  sessionCookieHeader,
  clearSessionCookieHeader,
  getSession,
  signShortLived,
  verifyShortLived,
  SESSION_COOKIE_NAME,
} from './session';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
});

function requestWithCookie(cookieHeader: string | null) {
  return { headers: { get: (name: string) => (name === 'cookie' ? cookieHeader : null) } };
}

describe('signSession / verifySession', () => {
  it('roundtrips sub and email', async () => {
    const token = await signSession({ sub: 'google-sub-123', email: 'user@example.com' });
    const claims = await verifySession(token);
    expect(claims).toEqual({ sub: 'google-sub-123', email: 'user@example.com' });
  });

  it('rejects a tampered payload', async () => {
    const token = await signSession({ sub: 'sub-1', email: 'user@example.com' });
    const [payload, sig] = token.split('.');
    // Flip the payload but keep the original signature — must fail verification.
    const tamperedPayload = payload.slice(0, -1) + (payload.slice(-1) === 'A' ? 'B' : 'A');
    const tampered = `${tamperedPayload}.${sig}`;
    expect(await verifySession(tampered)).toBeNull();
  });

  it('rejects an expired session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = await signSession({ sub: 'sub-1', email: 'user@example.com' });

    vi.setSystemTime(new Date('2026-03-01T00:00:00Z')); // > 30 days later
    expect(await verifySession(token)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession({ sub: 'sub-1', email: 'user@example.com' });
    process.env.SESSION_SECRET = 'a-completely-different-secret';
    expect(await verifySession(token)).toBeNull();
  });

  it('rejects malformed tokens', async () => {
    expect(await verifySession('not-a-valid-token')).toBeNull();
    expect(await verifySession('')).toBeNull();
    expect(await verifySession(null)).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });

  it('signSession throws if SESSION_SECRET is unset', async () => {
    delete process.env.SESSION_SECRET;
    await expect(signSession({ sub: 'sub-1', email: 'a@b.com' })).rejects.toThrow();
  });

  it('verifySession fails closed (returns null, never throws) if SESSION_SECRET is unset', async () => {
    const token = await signSession({ sub: 'sub-1', email: 'a@b.com' });
    delete process.env.SESSION_SECRET;
    expect(await verifySession(token)).toBeNull();
  });
});

describe('cookie header helpers', () => {
  it('sessionCookieHeader sets the correct name and attributes', () => {
    const header = sessionCookieHeader('abc.def');
    expect(header).toBe(
      `${SESSION_COOKIE_NAME}=abc.def; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`
    );
  });

  it('clearSessionCookieHeader expires immediately with an empty value', () => {
    const header = clearSessionCookieHeader();
    expect(header).toBe(`${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  });
});

describe('getSession', () => {
  it('resolves claims from a valid session cookie in the request', async () => {
    const token = await signSession({ sub: 'sub-42', email: 'grieving@example.com' });
    const req = requestWithCookie(`other=1; ${SESSION_COOKIE_NAME}=${token}; another=2`);
    expect(await getSession(req)).toEqual({ sub: 'sub-42', email: 'grieving@example.com' });
  });

  it('returns null with no cookie header', async () => {
    expect(await getSession(requestWithCookie(null))).toBeNull();
  });

  it('returns null when the session cookie is absent', async () => {
    expect(await getSession(requestWithCookie('other=1'))).toBeNull();
  });

  it('returns null for a tampered cookie value', async () => {
    const token = await signSession({ sub: 'sub-42', email: 'a@b.com' });
    const req = requestWithCookie(`${SESSION_COOKIE_NAME}=${token}xx`);
    expect(await getSession(req)).toBeNull();
  });
});

describe('signShortLived / verifyShortLived (OAuth state/PKCE cookies)', () => {
  it('roundtrips an opaque value', async () => {
    const token = await signShortLived('random-state-value', 300);
    expect(await verifyShortLived(token)).toBe('random-state-value');
  });

  it('expires after the given TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = await signShortLived('pkce-verifier', 300); // 5 min

    vi.setSystemTime(new Date('2026-01-01T00:06:00Z')); // 6 min later
    expect(await verifyShortLived(token)).toBeNull();
  });

  it('returns null for null/undefined input', async () => {
    expect(await verifyShortLived(null)).toBeNull();
    expect(await verifyShortLived(undefined)).toBeNull();
  });
});
