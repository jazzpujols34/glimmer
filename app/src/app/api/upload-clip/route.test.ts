import { describe, it, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/r2', () => ({
  r2Put: vi.fn(() => Promise.resolve(true)),
}));

import { POST } from './route';

const MP4_HEADER = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00];
const TEXT_HEADER = Array.from('not actually a video').map(c => c.charCodeAt(0));

function buildRequest(formData: FormData, ip = '10.0.0.1'): NextRequest {
  return {
    formData: async () => formData,
    headers: new Headers({ 'cf-connecting-ip': ip }),
  } as unknown as NextRequest;
}

describe('POST /api/upload-clip — magic-byte signature check', () => {
  it('rejects a file whose content does not match a video signature, despite a video/* MIME type', async () => {
    const fakeVideo = new File([new Uint8Array(TEXT_HEADER)], 'clip.mp4', { type: 'video/mp4' });
    const formData = new FormData();
    formData.set('file', fakeVideo);
    formData.set('jobId', 'job_1');

    const res = await POST(buildRequest(formData));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/does not match/i);
  });

  it('accepts a real MP4-signature file (happy path unchanged)', async () => {
    const realVideo = new File([new Uint8Array(MP4_HEADER)], 'clip.mp4', { type: 'video/mp4' });
    const formData = new FormData();
    formData.set('file', realVideo);
    formData.set('jobId', 'job_1');

    const res = await POST(buildRequest(formData));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.r2Key).toContain('job_1');
  });
});
