import { describe, it, expect } from 'vitest';
import type { StoryboardSlot } from '@/types';
import { r2KeyToPlayableUrl, buildUploadedClip, getDisplaySlot } from './storyboard-upload';

const slot = (over: Partial<StoryboardSlot>): StoryboardSlot => ({ id: 's1', index: 0, status: 'empty', ...over });

describe('r2KeyToPlayableUrl', () => {
  it('maps an R2 key to a relative proxy-r2 path', () => {
    expect(r2KeyToPlayableUrl('uploads/sb_1/ab12cd34.mp4')).toBe('/api/proxy-r2?key=uploads%2Fsb_1%2Fab12cd34.mp4');
  });
});

describe('buildUploadedClip', () => {
  it('persists the permanent key and proxy URL, never a blob URL', () => {
    const clip = buildUploadedClip('uploads/sb_1/ab12cd34.mp4', 7.5);
    expect(clip).toEqual({
      sourceType: 'upload',
      videoUrl: '/api/proxy-r2?key=uploads%2Fsb_1%2Fab12cd34.mp4',
      r2Key: 'uploads/sb_1/ab12cd34.mp4',
      duration: 7.5,
      fitMode: 'letterbox',
    });
    expect(clip.videoUrl.startsWith('blob:')).toBe(false);
  });
});

describe('getDisplaySlot', () => {
  it('shows a local in-flight upload as uploading even if the server slot is empty', () => {
    expect(getDisplaySlot(slot({ id: 'slot_a' }), new Set(['slot_a'])).status).toBe('uploading');
  });
  it('treats a legacy server-side uploading slot with no local upload as empty', () => {
    const d = getDisplaySlot(slot({ status: 'uploading', uploadProgress: 0 }), new Set());
    expect(d.status).toBe('empty');
    expect(d.uploadProgress).toBeUndefined();
  });
  it('treats a legacy filled upload clip with a blob URL as empty', () => {
    const d = getDisplaySlot(
      slot({ status: 'filled', clip: { sourceType: 'upload', videoUrl: 'blob:http://x/1', duration: 3, fitMode: 'letterbox' } }),
      new Set(),
    );
    expect(d.status).toBe('empty');
    expect(d.clip).toBeUndefined();
  });
  it('leaves a filled slot with a permanent URL untouched', () => {
    const s = slot({ status: 'filled', clip: buildUploadedClip('uploads/a/b.mp4', 3) });
    expect(getDisplaySlot(s, new Set())).toBe(s);
  });
});
