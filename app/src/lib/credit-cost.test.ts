import { describe, it, expect } from 'vitest';
import { creditsForGeneration, BASE_PIXELS, BASE_DURATION } from './credit-cost';
import { defaultSettings } from '@/types';
import type { GenerationSettings, Resolution } from '@/types';

describe('creditsForGeneration', () => {
  it('720p / 5s / x1 costs 1 credit (base case)', () => {
    expect(creditsForGeneration({ ...defaultSettings, resolution: '720p', videoLength: 5, numResults: 1 })).toBe(1);
  });

  it('720p / 5s / x4 costs 4 credits', () => {
    expect(creditsForGeneration({ ...defaultSettings, resolution: '720p', videoLength: 5, numResults: 4 })).toBe(4);
  });

  it('1080p / 5s / x1 rounds 2.25x up to 3 credits', () => {
    expect(creditsForGeneration({ ...defaultSettings, resolution: '1080p', videoLength: 5, numResults: 1 })).toBe(3);
  });

  it('720p / 12s / x1 rounds 2.4x up to 3 credits', () => {
    expect(creditsForGeneration({ ...defaultSettings, resolution: '720p', videoLength: 12, numResults: 1 })).toBe(3);
  });

  it('1080p / 12s / x1 rounds 5.4x up to 6 credits', () => {
    expect(creditsForGeneration({ ...defaultSettings, resolution: '1080p', videoLength: 12, numResults: 1 })).toBe(6);
  });

  it('1080p / 12s / x4 rounds 21.6x up to 22 credits', () => {
    expect(creditsForGeneration({ ...defaultSettings, resolution: '1080p', videoLength: 12, numResults: 4 })).toBe(22);
  });

  it('LOAD-BEARING: defaultSettings cost exactly 1 credit — free tier and existing users must see no change', () => {
    expect(creditsForGeneration(defaultSettings)).toBe(1);
  });

  it('BASE_PIXELS/BASE_DURATION constants match the 720p/5s default', () => {
    expect(BASE_PIXELS).toBe(1280 * 720);
    expect(BASE_DURATION).toBe(5);
  });

  describe('degenerate inputs — must never return 0, NaN, or negative', () => {
    it('unknown resolution falls back to BASE_PIXELS (720p)', () => {
      const settings = {
        ...defaultSettings,
        resolution: '4k' as unknown as Resolution,
        videoLength: 5,
        numResults: 1,
      };
      expect(creditsForGeneration(settings)).toBe(1);
    });

    it('missing resolution falls back to BASE_PIXELS', () => {
      const settings = { ...defaultSettings, videoLength: 5, numResults: 1 } as GenerationSettings;
      delete (settings as Partial<GenerationSettings>).resolution;
      expect(creditsForGeneration(settings)).toBe(1);
    });

    it('missing videoLength falls back to BASE_DURATION', () => {
      const settings = { ...defaultSettings, resolution: '720p', numResults: 1 } as GenerationSettings;
      delete (settings as Partial<GenerationSettings>).videoLength;
      expect(creditsForGeneration(settings)).toBe(1);
    });

    it('missing numResults falls back to 1', () => {
      const settings = { ...defaultSettings, resolution: '720p', videoLength: 5 } as GenerationSettings;
      delete (settings as Partial<GenerationSettings>).numResults;
      expect(creditsForGeneration(settings)).toBe(1);
    });

    it('numResults of 0 falls back to 1', () => {
      expect(creditsForGeneration({ ...defaultSettings, resolution: '720p', videoLength: 5, numResults: 0 })).toBe(1);
    });

    it('negative videoLength and numResults never produce NaN or a value below 1', () => {
      const result = creditsForGeneration({
        ...defaultSettings,
        resolution: '4k' as unknown as Resolution,
        videoLength: -5,
        numResults: -1,
      });
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(1);
    });

    it('a fully empty settings object never returns less than 1', () => {
      const result = creditsForGeneration({} as GenerationSettings);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(1);
    });
  });
});
