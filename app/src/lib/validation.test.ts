import { describe, it, expect } from 'vitest';
import { validateSettings, validatePhoto } from './validation';
import { defaultSettings } from '@/types';

describe('validateSettings — videoLength clamp', () => {
  it('clamps 1 up to the 4s floor (BytePlus seedance-1-5-pro rejects <4)', () => {
    expect(validateSettings({ videoLength: 1 }).videoLength).toBe(4);
  });

  it('clamps 2 up to 4', () => {
    expect(validateSettings({ videoLength: 2 }).videoLength).toBe(4);
  });

  it('clamps 3 up to 4', () => {
    expect(validateSettings({ videoLength: 3 }).videoLength).toBe(4);
  });

  it('leaves 4 (the floor) unchanged', () => {
    expect(validateSettings({ videoLength: 4 }).videoLength).toBe(4);
  });

  it('leaves 12 (the ceiling) unchanged', () => {
    expect(validateSettings({ videoLength: 12 }).videoLength).toBe(12);
  });

  it('clamps 13 down to 12', () => {
    expect(validateSettings({ videoLength: 13 }).videoLength).toBe(12);
  });

  it('falls back to the default when videoLength is non-numeric', () => {
    expect(validateSettings({ videoLength: 'five' }).videoLength).toBe(defaultSettings.videoLength);
    expect(validateSettings({ videoLength: null }).videoLength).toBe(defaultSettings.videoLength);
    expect(validateSettings({}).videoLength).toBe(defaultSettings.videoLength);
  });
});

describe('validateSettings — server-side model restriction', () => {
  // creditsForGeneration() prices at BytePlus/seedance token rates only. Veo
  // runs ~7x the cost/sec — accepting it here would sell generations
  // underwater even though the UI dropdown already disables it.
  it('accepts byteplus (the only server-enabled model)', () => {
    expect(validateSettings({ model: 'byteplus' }).model).toBe('byteplus');
  });

  it('coerces veo-3.1 to byteplus', () => {
    expect(validateSettings({ model: 'veo-3.1' }).model).toBe('byteplus');
  });

  it('coerces veo-3.1-fast to byteplus', () => {
    expect(validateSettings({ model: 'veo-3.1-fast' }).model).toBe('byteplus');
  });

  it('coerces kling-ai to byteplus', () => {
    expect(validateSettings({ model: 'kling-ai' }).model).toBe('byteplus');
  });

  it('coerces an unrecognized model string to byteplus', () => {
    expect(validateSettings({ model: 'not-a-real-model' }).model).toBe('byteplus');
  });

  it('defaults to byteplus when model is missing', () => {
    expect(validateSettings({}).model).toBe('byteplus');
  });
});

describe('validatePhoto — magic-byte signature check', () => {
  const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
  const TEXT_HEADER = Array.from('not actually an image').map(c => c.charCodeAt(0));

  it('accepts a real PNG file labeled image/png', async () => {
    const file = new File([new Uint8Array(PNG_HEADER)], 'photo.png', { type: 'image/png' });
    const result = await validatePhoto(file);
    expect(result.valid).toBe(true);
  });

  it('rejects a file whose content does not match an image signature, despite an image/* MIME type', async () => {
    const file = new File([new Uint8Array(TEXT_HEADER)], 'photo.png', { type: 'image/png' });
    const result = await validatePhoto(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/does not match/i);
  });
});
