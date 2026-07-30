import { describe, it, expect } from 'vitest';
import { buildBytePlusContent } from './veo';
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
