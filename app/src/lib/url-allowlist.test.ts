import { describe, it, expect, vi, afterEach } from 'vitest';

const ORIGINAL_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const ORIGINAL_EXTRA_HOSTS = process.env.EXPORT_URL_ALLOWED_HOSTS;

afterEach(() => {
  if (ORIGINAL_BASE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_BASE_URL = ORIGINAL_BASE_URL;
  }
  if (ORIGINAL_EXTRA_HOSTS === undefined) {
    delete process.env.EXPORT_URL_ALLOWED_HOSTS;
  } else {
    process.env.EXPORT_URL_ALLOWED_HOSTS = ORIGINAL_EXTRA_HOSTS;
  }
  vi.resetModules();
});

describe('isAllowedExportUrl', () => {
  it('allows an absolute URL on our own origin (NEXT_PUBLIC_BASE_URL host)', async () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://glimmer.video';
    vi.resetModules();
    const { isAllowedExportUrl } = await import('./url-allowlist');

    expect(isAllowedExportUrl('https://glimmer.video/api/proxy-video?jobId=abc&index=0')).toBe(true);
  });

  it('allows a plain path on our own origin, not just /api/proxy-video', async () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://glimmer.video';
    vi.resetModules();
    const { isAllowedExportUrl } = await import('./url-allowlist');

    expect(isAllowedExportUrl('https://glimmer.video/audio/bundled/gentle-piano.mp3')).toBe(true);
  });

  it('allows BytePlus CDN URLs (real not-yet-archived video format)', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl('https://vod.bytepluscdn.com/x/video.mp4')).toBe(true);
  });

  // Regression: this is the host BytePlus ACTUALLY serves generated videos from
  // (verified 2026-07-31 against a real completed task). An allowlist without it
  // rejects every export of a video that has not been archived to R2 yet.
  it('allows the real BytePlus/Volcano Engine object-storage host', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl(
      'https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/x/video.mp4'
    )).toBe(true);
  });

  it('rejects a lookalike of the volces host', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl('https://evilvolces.com/x.mp4')).toBe(false);
  });
});

describe('isSsrfSafeExportUrl (hostless values must not be rejected)', () => {
  // Editor music stores a bare filename; storyboard uploads store a bare R2 key.
  // Neither designates a host, so neither is an SSRF vector — hard-failing them
  // would break exports that work the same way today.
  it('allows a bare filename (editor uploaded music)', async () => {
    const { isSsrfSafeExportUrl } = await import('./url-allowlist');
    expect(isSsrfSafeExportUrl('song.mp3')).toBe(true);
  });

  it('allows a bare R2 key (storyboard uploaded music)', async () => {
    const { isSsrfSafeExportUrl } = await import('./url-allowlist');
    expect(isSsrfSafeExportUrl('music/storyboard_abc/track.mp3')).toBe(true);
  });

  it('allows an empty value', async () => {
    const { isSsrfSafeExportUrl } = await import('./url-allowlist');
    expect(isSsrfSafeExportUrl('')).toBe(true);
  });

  it('rejects a protocol-relative URL that would resolve to another host', async () => {
    const { isSsrfSafeExportUrl } = await import('./url-allowlist');
    expect(isSsrfSafeExportUrl('//attacker.example.com/x.mp3')).toBe(false);
  });

  it('still host-checks absolute URLs', async () => {
    const { isSsrfSafeExportUrl } = await import('./url-allowlist');
    expect(isSsrfSafeExportUrl('https://attacker.example.com/x.mp3')).toBe(false);
    expect(isSsrfSafeExportUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSsrfSafeExportUrl('https://glimmer.video/api/proxy-r2?key=music/a.mp3')).toBe(true);
  });

  it('rejects a lookalike host — suffix match must not be a substring match', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl('https://evilbytepluscdn.com/x.mp4')).toBe(false);
  });

  it('allows a subdomain of an allowed suffix', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl('https://cdn.bytepluses.com/x.mp4')).toBe(true);
  });

  it('rejects an arbitrary attacker-controlled host', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl('https://attacker.example.com/x.mp4')).toBe(false);
  });

  it('rejects the cloud metadata IP', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('rejects localhost', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl('http://localhost:8080/x')).toBe(false);
  });

  it('rejects 127.0.0.1 and [::1] loopback', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl('http://127.0.0.1/x')).toBe(false);
    expect(isAllowedExportUrl('http://[::1]/x')).toBe(false);
  });

  it('rejects a bare IP literal even if not on the blocklist', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl('http://93.184.216.34/x.mp4')).toBe(false);
  });

  it('rejects non-http(s) schemes', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedExportUrl('ftp://vod.bytepluscdn.com/x.mp4')).toBe(false);
    expect(isAllowedExportUrl('data:text/plain;base64,aGVsbG8=')).toBe(false);
  });

  it('rejects URLs with embedded credentials', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(isAllowedExportUrl('https://user:pass@vod.bytepluscdn.com/x.mp4')).toBe(false);
  });

  it('allows a host added via EXPORT_URL_ALLOWED_HOSTS without a code deploy', async () => {
    process.env.EXPORT_URL_ALLOWED_HOSTS = 'new-provider-cdn.com, other-cdn.example';
    vi.resetModules();
    const { isAllowedExportUrl } = await import('./url-allowlist');

    expect(isAllowedExportUrl('https://edge.new-provider-cdn.com/video.mp4')).toBe(true);
    expect(isAllowedExportUrl('https://other-cdn.example/video.mp4')).toBe(true);
    expect(isAllowedExportUrl('https://not-listed.com/video.mp4')).toBe(false);
  });

  it('rejects empty and garbage strings without throwing', async () => {
    const { isAllowedExportUrl } = await import('./url-allowlist');
    expect(() => isAllowedExportUrl('')).not.toThrow();
    expect(isAllowedExportUrl('')).toBe(false);
    expect(() => isAllowedExportUrl('not a url at all')).not.toThrow();
    expect(isAllowedExportUrl('not a url at all')).toBe(false);
    // @ts-expect-error deliberately testing non-string input safety
    expect(() => isAllowedExportUrl(null)).not.toThrow();
  });
});
