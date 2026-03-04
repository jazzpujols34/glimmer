/** Get video duration by loading metadata in an off-screen element */
export function getVideoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    video.onloadedmetadata = () => {
      resolve(video.duration);
      video.src = '';
    };
    video.onerror = () => {
      video.src = '';
      reject(new Error('Failed to load video metadata'));
    };
  });
}

/** Get audio duration by loading metadata. Falls back to `fallbackSeconds` on error. */
export function getAudioDuration(url: string, fallbackSeconds = 60): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.onloadedmetadata = () => resolve(audio.duration);
    audio.onerror = () => resolve(fallbackSeconds);
  });
}
