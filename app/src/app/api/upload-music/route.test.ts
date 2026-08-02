import { describe, it, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/r2', () => ({
  r2Put: vi.fn(() => Promise.resolve(true)),
}));

import { POST } from './route';

const MP3_ID3_HEADER = [0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
const TEXT_HEADER = Array.from('not actually audio').map(c => c.charCodeAt(0));

function buildRequest(formData: FormData, ip = '10.0.0.1'): NextRequest {
  return {
    formData: async () => formData,
    headers: new Headers({ 'cf-connecting-ip': ip }),
  } as unknown as NextRequest;
}

describe('POST /api/upload-music — magic-byte signature check', () => {
  it('rejects a file whose content does not match an audio signature, despite an audio/* MIME type', async () => {
    const fakeAudio = new File([new Uint8Array(TEXT_HEADER)], 'song.mp3', { type: 'audio/mpeg' });
    const formData = new FormData();
    formData.set('file', fakeAudio);
    formData.set('storyboardId', 'sb_1');

    const res = await POST(buildRequest(formData));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('檔案內容與音訊格式不符');
  });

  it('accepts a real MP3-signature file (happy path unchanged)', async () => {
    const realAudio = new File([new Uint8Array(MP3_ID3_HEADER)], 'song.mp3', { type: 'audio/mpeg' });
    const formData = new FormData();
    formData.set('file', realAudio);
    formData.set('storyboardId', 'sb_1');

    const res = await POST(buildRequest(formData));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.r2Key).toContain('sb_1');
  });
});
