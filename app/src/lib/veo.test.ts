import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildBytePlusContent, checkBytePlusTasks } from './veo';
import { defaultSettings } from '@/types';
import type { GenerationSettings } from '@/types';

// buildBytePlusContent is pure (no fetch/env access) so no mocking is needed —
// unlike credits.test.ts, which mocks KV because credits.ts does real I/O.

const photo1 = Buffer.from('fake-photo-bytes-1');
const photo2 = Buffer.from('fake-photo-bytes-2');

function makeSettings(overrides: Partial<GenerationSettings> = {}): GenerationSettings {
  return { ...defaultSettings, model: 'byteplus', ...overrides };
}

describe('buildBytePlusContent', () => {
  it('single image + image-to-video: exactly one image item with no role key (production-proven shape)', () => {
    const settings = makeSettings({ taskType: 'image-to-video' });
    const content = buildBytePlusContent([photo1], 'a prompt', settings);

    const imageItems = content.filter((item) => item.type === 'image_url');
    expect(imageItems).toHaveLength(1);
    // Byte-identical shape check: exactly {type, image_url} — no `role` key at all.
    expect(Object.keys(imageItems[0]).sort()).toEqual(['image_url', 'type']);
    expect(imageItems[0]).not.toHaveProperty('role');
    expect(imageItems[0].image_url?.url).toContain('data:image/jpeg;base64,');
  });

  it('two images + first-last-frame: first image role=first_frame, second role=last_frame', () => {
    const settings = makeSettings({ taskType: 'first-last-frame' });
    const content = buildBytePlusContent([photo1, photo2], 'a prompt', settings);

    const imageItems = content.filter((item) => item.type === 'image_url');
    expect(imageItems).toHaveLength(2);
    expect(imageItems[0].role).toBe('first_frame');
    expect(imageItems[1].role).toBe('last_frame');
  });

  it('first-last-frame with only one photo falls back to single-image shape (no lone last_frame)', () => {
    const settings = makeSettings({ taskType: 'first-last-frame' });
    const content = buildBytePlusContent([photo1], 'a prompt', settings);

    const imageItems = content.filter((item) => item.type === 'image_url');
    expect(imageItems).toHaveLength(1);
    expect(imageItems[0]).not.toHaveProperty('role');
  });

  it('clamps the --duration flag in the text prompt to 4-12 seconds', () => {
    const getDuration = (videoLength: number) => {
      const content = buildBytePlusContent([photo1], 'p', makeSettings({ videoLength }));
      const text = content.find((item) => item.type === 'text')?.text || '';
      const match = text.match(/--duration (\d+)/);
      return match ? Number(match[1]) : null;
    };

    expect(getDuration(2)).toBe(4);
    expect(getDuration(3)).toBe(4);
    expect(getDuration(4)).toBe(4);
    expect(getDuration(8)).toBe(8);
    expect(getDuration(12)).toBe(12);
    expect(getDuration(15)).toBe(12);
  });
});

describe('checkBytePlusTasks — only the provider saying "failed" is a failure', () => {
  const realFetch = globalThis.fetch;
  const respond = (status: number, body: unknown = {}) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
  const ok = (url: string) => respond(200, { status: 'succeeded', content: { video_url: url } });
  const failed = (message: string) => respond(200, { status: 'failed', error: { code: 'X', message } });
  const queue = (...answers: Array<() => Promise<Response>>) => {
    const fn = vi.fn();
    answers.forEach(a => fn.mockImplementationOnce(a));
    globalThis.fetch = fn as typeof fetch;
  };

  beforeEach(() => {
    process.env.BYTEPLUS_API_KEY = 'test-key';
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it.each([429, 500, 503, 401, 404])('a status call answering %i leaves the job running, at any age', async (code) => {
    queue(() => respond(code));
    const result = await checkBytePlusTasks(['t1']);
    expect(result.done).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('a missing API key is "could not ask", not a failed video', async () => {
    delete process.env.BYTEPLUS_API_KEY;
    await expect(checkBytePlusTasks(['t1'])).rejects.toThrow('BYTEPLUS_API_KEY');
  });

  it('one finished task plus one unreachable task is progress, not completion', async () => {
    queue(() => ok('https://cdn/a.mp4'), () => respond(502));
    const result = await checkBytePlusTasks(['t1', 't2']);
    expect(result.done).toBe(false);
    expect(result.videoUrls).toBeUndefined();
  });

  it('keeps the good videos when one of four fails', async () => {
    queue(() => ok('https://cdn/a.mp4'), () => failed('OutputVideoSensitiveContentDetected'), () => ok('https://cdn/c.mp4'), () => ok('https://cdn/d.mp4'));
    const result = await checkBytePlusTasks(['t1', 't2', 't3', 't4']);
    expect(result).toEqual({
      done: true,
      videoUrls: ['https://cdn/a.mp4', 'https://cdn/c.mp4', 'https://cdn/d.mp4'],
      failedCount: 1,
      error: 'OutputVideoSensitiveContentDetected',
    });
  });

  it('does not settle while a failed task has a sibling still rendering', async () => {
    queue(() => failed('boom'), () => respond(200, { status: 'running' }));
    expect((await checkBytePlusTasks(['t1', 't2'])).done).toBe(false);
  });

  it('is a plain failure when every task failed', async () => {
    queue(() => failed('boom'), () => failed('bang'));
    expect(await checkBytePlusTasks(['t1', 't2'])).toEqual({ done: true, error: 'boom' });
  });

  it('all good: no failure fields at all', async () => {
    queue(() => ok('https://cdn/a.mp4'));
    expect(await checkBytePlusTasks(['t1'])).toEqual({ done: true, videoUrls: ['https://cdn/a.mp4'] });
  });
});
