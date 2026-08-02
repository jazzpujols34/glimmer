import { describe, it, expect } from 'vitest';
import { matchesFileSignature } from './file-signature';

function blob(bytes: number[]): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const WAV_HEADER = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
const MP4_HEADER = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00];
const MOV_HEADER = [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20];
const M4A_HEADER = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20];
const MP3_ID3_HEADER = [0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
const MP3_FRAMESYNC_HEADER = [0xff, 0xfb, 0x90, 0x00, 0x00, 0x00];
const TEXT_HEADER = Array.from('this is not a real file').map(c => c.charCodeAt(0));

describe('matchesFileSignature — image', () => {
  it('accepts a real JPEG header', async () => {
    expect(await matchesFileSignature(blob(JPEG_HEADER), 'image')).toBe(true);
  });

  it('accepts a real PNG header', async () => {
    expect(await matchesFileSignature(blob(PNG_HEADER), 'image')).toBe(true);
  });

  it('accepts a real WEBP header', async () => {
    expect(await matchesFileSignature(blob(WEBP_HEADER), 'image')).toBe(true);
  });

  it('rejects a plain-text file claiming to be an image', async () => {
    expect(await matchesFileSignature(blob(TEXT_HEADER), 'image')).toBe(false);
  });

  it('rejects an MP4 header claiming to be an image', async () => {
    expect(await matchesFileSignature(blob(MP4_HEADER), 'image')).toBe(false);
  });
});

describe('matchesFileSignature — video', () => {
  it('accepts a real MP4 header', async () => {
    expect(await matchesFileSignature(blob(MP4_HEADER), 'video')).toBe(true);
  });

  it('accepts a real MOV header', async () => {
    expect(await matchesFileSignature(blob(MOV_HEADER), 'video')).toBe(true);
  });

  it('rejects a JPEG header claiming to be a video', async () => {
    expect(await matchesFileSignature(blob(JPEG_HEADER), 'video')).toBe(false);
  });

  it('rejects a plain-text file claiming to be a video', async () => {
    expect(await matchesFileSignature(blob(TEXT_HEADER), 'video')).toBe(false);
  });
});

describe('matchesFileSignature — audio', () => {
  it('accepts a real M4A header', async () => {
    expect(await matchesFileSignature(blob(M4A_HEADER), 'audio')).toBe(true);
  });

  it('accepts an ID3-tagged MP3 header', async () => {
    expect(await matchesFileSignature(blob(MP3_ID3_HEADER), 'audio')).toBe(true);
  });

  it('accepts a frame-sync MP3 header (no ID3 tag)', async () => {
    expect(await matchesFileSignature(blob(MP3_FRAMESYNC_HEADER), 'audio')).toBe(true);
  });

  it('accepts a real WAV header', async () => {
    expect(await matchesFileSignature(blob(WAV_HEADER), 'audio')).toBe(true);
  });

  it('rejects a WEBP header claiming to be audio (same RIFF container, wrong tag)', async () => {
    expect(await matchesFileSignature(blob(WEBP_HEADER), 'audio')).toBe(false);
  });

  it('rejects a plain-text file claiming to be audio', async () => {
    expect(await matchesFileSignature(blob(TEXT_HEADER), 'audio')).toBe(false);
  });
});
