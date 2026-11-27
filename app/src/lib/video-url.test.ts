import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getVideoUrl, getVideoUrls, resolveVideoUrl } from './video-url';

describe('getVideoUrl', () => {
  it('returns empty string for undefined or empty input', () => {
    expect(getVideoUrl('job_1', undefined)).toBe('');
    expect(getVideoUrl('job_1', '')).toBe('');
  });

  it('passes an http or https CDN URL through unchanged', () => {
    expect(getVideoUrl('job_1', 'https://vod.bytepluscdn.com/a/video.mp4')).toBe(
      'https://vod.bytepluscdn.com/a/video.mp4',
    );
    expect(getVideoUrl('job_1', 'http://example.com/v.mp4')).toBe('http://example.com/v.mp4');
  });

  it('maps an R2 key to the proxy URL, keeping the index from the key', () => {
    expect(getVideoUrl('job_1', 'videos/job_1/2.mp4', 0)).toBe('/api/proxy-video?jobId=job_1&index=2');
  });

  it('uses the fallback index for a non-matching key', () => {
    expect(getVideoUrl('job_1', 'something/else.mp4', 5)).toBe('/api/proxy-video?jobId=job_1&index=5');
    expect(getVideoUrl('job_1', 'something/else.mp4')).toBe('/api/proxy-video?jobId=job_1&index=0');
  });
});

describe('getVideoUrls', () => {
  it('returns [] for undefined or empty', () => {
    expect(getVideoUrls('job_1', undefined)).toEqual([]);
    expect(getVideoUrls('job_1', [])).toEqual([]);
  });

  it('maps each entry, using array position as fallback index', () => {
    expect(
      getVideoUrls('job_1', ['videos/job_1/3.mp4', 'https://cdn.example.com/x.mp4', 'raw-key']),
    ).toEqual([
      '/api/proxy-video?jobId=job_1&index=3',
      'https://cdn.example.com/x.mp4',
      '/api/proxy-video?jobId=job_1&index=2',
    ]);
  });
});

describe('resolveVideoUrl', () => {
  const base = 'https://glimmer.video';

  it('returns empty string for empty input', () => {
    expect(resolveVideoUrl('', 'playback', base)).toBe('');
  });

  it('passes absolute URLs through in both contexts', () => {
    const u = 'https://glimmer.video/api/proxy-video?jobId=a&index=0';
    expect(resolveVideoUrl(u, 'playback', base)).toBe(u);
    expect(resolveVideoUrl(u, 'export', base)).toBe(u);
  });

  it('strips local:// for playback and returns empty for export', () => {
    expect(resolveVideoUrl('local://blob:abc', 'playback', base)).toBe('blob:abc');
    expect(resolveVideoUrl('local://blob:abc', 'export', base)).toBe('');
  });

  it('keeps /api/ paths relative for playback, absolute for export', () => {
    const p = '/api/proxy-video?jobId=a&index=1';
    expect(resolveVideoUrl(p, 'playback', base)).toBe(p);
    expect(resolveVideoUrl(p, 'export', base)).toBe(`${base}${p}`);
  });

  it('maps videos/<job>/<n>.mp4 to proxy-video, relative vs absolute by context', () => {
    const path = '/api/proxy-video?jobId=job_x&index=0';
    expect(resolveVideoUrl('videos/job_x/0.mp4', 'playback', base)).toBe(path);
    expect(resolveVideoUrl('videos/job_x/0.mp4', 'export', base)).toBe(`${base}${path}`);
  });

  it('maps other R2 keys to proxy-r2 with an encoded key', () => {
    const path = '/api/proxy-r2?key=uploads%2Fu1%2Ffile.mp4';
    expect(resolveVideoUrl('uploads/u1/file.mp4', 'playback', base)).toBe(path);
    expect(resolveVideoUrl('uploads/u1/file.mp4', 'export', base)).toBe(`${base}${path}`);
  });

  it('treats any bare .mp4 as an R2 key', () => {
    expect(resolveVideoUrl('clip.mp4', 'playback', base)).toBe('/api/proxy-r2?key=clip.mp4');
  });

  it('falls back to proxy-r2 for an unknown format', () => {
    expect(resolveVideoUrl('weird thing', 'playback', base)).toBe('/api/proxy-r2?key=weird%20thing');
    expect(resolveVideoUrl('weird thing', 'export', base)).toBe(`${base}/api/proxy-r2?key=weird%20thing`);
  });
});
