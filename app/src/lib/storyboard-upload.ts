import type { StoryboardClip, StoryboardSlot } from '@/types';

// Same shape resolveVideoUrl() builds for R2 keys; works for <video> and, made absolute, for export.
export function r2KeyToPlayableUrl(r2Key: string): string {
  return `/api/proxy-r2?key=${encodeURIComponent(r2Key)}`;
}

export function buildUploadedClip(r2Key: string, duration: number): StoryboardClip {
  return {
    sourceType: 'upload',
    videoUrl: r2KeyToPlayableUrl(r2Key),
    r2Key,
    duration,
    fitMode: 'letterbox',
  };
}

// "uploading" is local-only state; a server copy of it (old code) or a saved blob: URL is dead data.
export function getDisplaySlot(slot: StoryboardSlot, uploadingIds: ReadonlySet<string>): StoryboardSlot {
  if (uploadingIds.has(slot.id)) {
    return { ...slot, status: 'uploading', clip: undefined };
  }
  const deadBlob = slot.status === 'filled' && slot.clip?.videoUrl.startsWith('blob:');
  if (slot.status === 'uploading' || deadBlob) {
    return { ...slot, status: 'empty', clip: undefined, uploadProgress: undefined };
  }
  return slot;
}
