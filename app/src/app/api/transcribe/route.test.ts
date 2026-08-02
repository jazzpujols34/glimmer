import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the KV module before importing anything that (transitively) depends on it.
// Mirrors the pattern in src/lib/credits.test.ts.
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
  kvListKeys: vi.fn((prefix: string) =>
    Promise.resolve(Array.from(mockStore.keys()).filter(k => k.startsWith(prefix)))
  ),
  getKV: vi.fn(() => Promise.resolve(null)),
}));

import { POST } from './route';
import { setEmailVerified } from '@/lib/credits';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockStore.clear();
  process.env.OPENAI_API_KEY = 'test-key';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function buildRequest(formData: FormData, ip = '10.0.0.1'): Request {
  return {
    formData: async () => formData,
    headers: new Headers({ 'cf-connecting-ip': ip }),
  } as unknown as Request;
}

describe('POST /api/transcribe — audio size cap', () => {
  it('rejects an oversized audio file before ever calling OpenAI', async () => {
    const email = 'audio-cap@example.com';
    await setEmailVerified(email);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const oversized = new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: 'audio/mp4' });
    const formData = new FormData();
    formData.set('email', email);
    formData.set('audio', oversized, 'big.mp4');

    const res = await POST(buildRequest(formData));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('音檔過大，請上傳 25MB 以下的檔案');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('leaves the happy path unchanged for a file within the size limit', async () => {
    const email = 'audio-ok@example.com';
    await setEmailVerified(email);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ segments: [{ text: 'hi', start: 0, end: 1 }] }),
      { status: 200 }
    )));

    const small = new Blob([new Uint8Array(1024)], { type: 'audio/mp4' });
    const formData = new FormData();
    formData.set('email', email);
    formData.set('audio', small, 'small.mp4');

    const res = await POST(buildRequest(formData));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.segments).toHaveLength(1);
  });
});
