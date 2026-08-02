import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

import { resolveIdentity, enforceIdentity } from './identity';
import { signSession, SESSION_COOKIE_NAME } from './session';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockStore.clear();
  process.env.SESSION_SECRET = 'test-session-secret';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function requestWithCookie(cookieHeader: string | null) {
  return { headers: { get: (name: string) => (name === 'cookie' ? cookieHeader : null) } };
}

describe('resolveIdentity', () => {
  it('returns fallbackEmail when there is no session (anonymous, unchanged behavior)', async () => {
    const result = await resolveIdentity(requestWithCookie(null), 'anon@example.com');
    expect(result).toBe('anon@example.com');
  });

  it('returns undefined when there is no session and no fallbackEmail', async () => {
    const result = await resolveIdentity(requestWithCookie(null));
    expect(result).toBeUndefined();
  });

  it('resolves through submap:<sub> when a session and mapping both exist', async () => {
    mockStore.set('submap:google-sub-1', 'mapped@example.com');
    const token = await signSession({ sub: 'google-sub-1', email: 'session-claim@example.com' });
    const req = requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`);

    const result = await resolveIdentity(req, 'ignored-fallback@example.com');
    expect(result).toBe('mapped@example.com');
  });

  it('falls back to the session email claim when submap is missing', async () => {
    const token = await signSession({ sub: 'google-sub-unmapped', email: 'session-claim@example.com' });
    const req = requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`);

    const result = await resolveIdentity(req, 'ignored-fallback@example.com');
    expect(result).toBe('session-claim@example.com');
  });

  it('a valid session always wins over fallbackEmail, even without a mapping', async () => {
    const token = await signSession({ sub: 'google-sub-2', email: 'signed-in@example.com' });
    const req = requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`);

    const result = await resolveIdentity(req, 'typed-anonymous@example.com');
    expect(result).toBe('signed-in@example.com');
  });

  it('an invalid/tampered session cookie behaves like no session', async () => {
    const token = await signSession({ sub: 'google-sub-3', email: 'x@example.com' });
    const req = requestWithCookie(`${SESSION_COOKIE_NAME}=${token}tampered`);

    const result = await resolveIdentity(req, 'fallback@example.com');
    expect(result).toBe('fallback@example.com');
  });
});

describe('enforceIdentity (Phase 2b — dormant unless REQUIRE_SESSION_FOR_PAID=true)', () => {
  it('flag unset: always returns the client email, regardless of session or sessionreq', async () => {
    delete process.env.REQUIRE_SESSION_FOR_PAID;
    mockStore.set('sessionreq:spoof-target@example.com', '1');
    const token = await signSession({ sub: 'some-sub', email: 'signed-in@example.com' });
    const req = requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`);

    const result = await enforceIdentity(req, 'spoof-target@example.com');
    expect(result).toEqual({ email: 'spoof-target@example.com' });
  });

  it('flag explicitly false: still a no-op, always the client email', async () => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'false';
    mockStore.set('sessionreq:spoof-target@example.com', '1');

    const result = await enforceIdentity(requestWithCookie(null), 'spoof-target@example.com');
    expect(result).toEqual({ email: 'spoof-target@example.com' });
  });

  it('flag on + no session + no sessionreq entry: legacy/never-signed-in email keeps working unchanged', async () => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'true';

    const result = await enforceIdentity(requestWithCookie(null), 'never-signed-in@example.com');
    expect(result).toEqual({ email: 'never-signed-in@example.com' });
  });

  it('flag on + no session + sessionreq entry set: refuses typed-email access', async () => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'true';
    mockStore.set('sessionreq:bound@example.com', '1');

    const result = await enforceIdentity(requestWithCookie(null), 'bound@example.com');
    expect(result).toEqual({ error: 'SESSION_REQUIRED' });
  });

  it('flag on + no session + sessionreq lookup is case/whitespace-insensitive (same normalize() as credits)', async () => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'true';
    mockStore.set('sessionreq:bound@example.com', '1');

    const result = await enforceIdentity(requestWithCookie(null), '  Bound@Example.com  ');
    expect(result).toEqual({ error: 'SESSION_REQUIRED' });
  });

  it('flag on + valid session: the session-resolved email wins, even when the client-supplied email differs (spoof-proof)', async () => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'true';
    const token = await signSession({ sub: 'spoof-sub', email: 'real-owner@example.com' });
    const req = requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`);

    const result = await enforceIdentity(req, 'someone-elses-email@example.com');
    expect(result).toEqual({ email: 'real-owner@example.com' });
  });

  it('flag on + valid session for an email that also has a sessionreq entry: the session still wins (not the SESSION_REQUIRED path)', async () => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'true';
    mockStore.set('sessionreq:real-owner@example.com', '1');
    mockStore.set('submap:established-sub', 'real-owner@example.com');
    const token = await signSession({ sub: 'established-sub', email: 'session-claim@example.com' });
    const req = requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`);

    const result = await enforceIdentity(req, 'real-owner@example.com');
    expect(result).toEqual({ email: 'real-owner@example.com' });
  });

  it('flag on + invalid/tampered session cookie: treated as no session, falls through to the sessionreq check', async () => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'true';
    mockStore.set('sessionreq:bound@example.com', '1');
    const token = await signSession({ sub: 'sub-x', email: 'x@example.com' });
    const req = requestWithCookie(`${SESSION_COOKIE_NAME}=${token}tampered`);

    const result = await enforceIdentity(req, 'bound@example.com');
    expect(result).toEqual({ error: 'SESSION_REQUIRED' });
  });
});
