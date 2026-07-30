/**
 * Credit cost for a generation — proportional to BytePlus provider cost.
 *
 * BytePlus bills by tokens: tokens = width * height * fps * duration / 1024
 * (verified against a real job: 1080p/12s measured 585,225 tokens vs a
 * predicted 583,200 — 0.35% error). fps is constant across our settings, so
 * cost is linear in pixels * duration * numResults. We price relative to the
 * 720p / 5s / x1 default so existing free-tier and paying users see no change.
 */

import type { GenerationSettings, Resolution } from '@/types';

export const BASE_PIXELS = 1280 * 720; // 720p
export const BASE_DURATION = 5; // seconds

const PIXELS: Record<string, number> = {
  '720p': 1280 * 720,
  '1080p': 1920 * 1080,
};

export function creditsForGeneration(settings: GenerationSettings): number {
  const pixels = (settings?.resolution && PIXELS[settings.resolution as Resolution]) || BASE_PIXELS;
  const videoLength = settings?.videoLength;
  const duration = typeof videoLength === 'number' && videoLength > 0 ? videoLength : BASE_DURATION;
  const numResultsInput = settings?.numResults;
  const numResults = typeof numResultsInput === 'number' && numResultsInput > 0 ? numResultsInput : 1;

  const raw = (pixels / BASE_PIXELS) * (duration / BASE_DURATION) * numResults;
  return Math.max(1, Math.ceil(raw));
}
