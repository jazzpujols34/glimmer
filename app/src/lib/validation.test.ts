import { describe, it, expect } from 'vitest';
import { validateSettings } from './validation';
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
