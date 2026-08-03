/**
 * Tests for resolveReaderEmail — the Phase 2b gate on read/list routes.
 * Kept in its own file because owner.test.ts mocks './credits' down to just
 * isAdmin, while this path also needs normalize() and a real KV double.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockStore = new Map<string, string>();

vi.mock('./kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
}));

import { resolveReaderEmail } from './owner';
import { signSession, sessionCookieHeader, SESSION_COOKIE_NAME } from './session';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockStore.clear();
  process.env.SESSION_SECRET = 'test-secret-for-reader-tests';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function req(url: string, cookie?: string) {
  return {
    url,
    headers: { get: (n: string) => (n.toLowerCase() === 'cookie' ? cookie ?? null : null) },
  };
}

async function sessionCookieFor(sub: string, email: string): Promise<string> {
  const token = await signSession({ sub, email });
  // Reuse the real Set-Cookie builder so this breaks if the cookie format moves.
  return sessionCookieHeader(token).split(';')[0];
}

describe('resolveReaderEmail — flag off (must be byte-identical to pre-Phase-2b)', () => {
  beforeEach(() => {
    delete process.env.REQUIRE_SESSION_FOR_PAID;
  });

  it('returns the client-supplied email', async () => {
    expect(await resolveReaderEmail(req('https://x/api/gallery?email=a@b.com'))).toEqual({
      email: 'a@b.com',
    });
  });

  it('normalises case and whitespace', async () => {
    const url = `https://x/api/gallery?email=${encodeURIComponent('  A@B.com  ')}`;
    expect(await resolveReaderEmail(req(url))).toEqual({ email: 'a@b.com' });
  });

  it('reports a missing email distinctly from an invalid one', async () => {
    expect(await resolveReaderEmail(req('https://x/api/gallery'))).toEqual({ error: 'MISSING' });
    expect(await resolveReaderEmail(req('https://x/api/gallery?email=nonsense'))).toEqual({
      error: 'INVALID',
    });
  });

  it('ignores a session entirely while the flag is off', async () => {
    const cookie = await sessionCookieFor('email:owner@x.com', 'owner@x.com');
    expect(await resolveReaderEmail(req('https://x/api/gallery?email=victim@x.com', cookie))).toEqual(
      { email: 'victim@x.com' },
    );
  });
});

describe('resolveReaderEmail — flag on', () => {
  beforeEach(() => {
    process.env.REQUIRE_SESSION_FOR_PAID = 'true';
  });

  it('lets an un-armed email through unchanged (auto-migrate)', async () => {
    expect(await resolveReaderEmail(req('https://x/api/gallery?email=new@x.com'))).toEqual({
      email: 'new@x.com',
    });
  });

  it('refuses a typed email that has armed enforcement', async () => {
    mockStore.set('sessionreq:armed@x.com', '1');
    expect(await resolveReaderEmail(req('https://x/api/gallery?email=armed@x.com'))).toEqual({
      error: 'SESSION_REQUIRED',
    });
  });

  it('a valid session wins over a spoofed query email — this is the hole being closed', async () => {
    mockStore.set('sessionreq:armed@x.com', '1');
    const cookie = await sessionCookieFor('email:armed@x.com', 'armed@x.com');
    expect(await resolveReaderEmail(req('https://x/api/gallery?email=victim@x.com', cookie))).toEqual(
      { email: 'armed@x.com' },
    );
  });

  it('resolves a session through submap so reads stay keyed to the data email', async () => {
    mockStore.set('submap:104715399479452712199', 'ro5112@hotmail.com');
    const cookie = await sessionCookieFor('104715399479452712199', 'glimmer.hello@gmail.com');
    expect(await resolveReaderEmail(req('https://x/api/gallery?email=whatever@x.com', cookie))).toEqual(
      { email: 'ro5112@hotmail.com' },
    );
  });

  it('a session alone is enough with no email param', async () => {
    const cookie = await sessionCookieFor('email:solo@x.com', 'solo@x.com');
    expect(await resolveReaderEmail(req('https://x/api/gallery', cookie))).toEqual({
      email: 'solo@x.com',
    });
  });

  it('still requires a readable email when there is no session', async () => {
    expect(await resolveReaderEmail(req('https://x/api/gallery'))).toEqual({ error: 'MISSING' });
  });

  it('ignores a forged cookie and falls back to the query email', async () => {
    const forged = `${SESSION_COOKIE_NAME}=not-a-real-token`;
    expect(await resolveReaderEmail(req('https://x/api/gallery?email=a@b.com', forged))).toEqual({
      email: 'a@b.com',
    });
  });
});
