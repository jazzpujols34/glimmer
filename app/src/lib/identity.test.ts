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

import { resolveIdentity } from './identity';
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
