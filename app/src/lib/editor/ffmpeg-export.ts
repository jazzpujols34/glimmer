import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { EditorState } from '@/types/editor';
import { getClipDuration, clipsSortedByPosition, getOutroStart } from './timeline-utils';
import { FFMPEG_FILTERS } from './filter-maps';

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(onProgress?: (ratio: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;

  const ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
    // Extract progress from FFmpeg output
    const match = message.match(/time=(\d+):(\d+):(\d+\.\d+)/);
    if (match && onProgress) {
      const secs = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
      onProgress(secs);
    }
  });

  // Load single-threaded (avoids COOP/COEP header requirement)
  try {
    console.log('[FFmpeg] Loading FFmpeg.wasm...');
    await ffmpeg.load();
    console.log('[FFmpeg] FFmpeg.wasm loaded successfully');
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  } catch (err) {
    console.error('[FFmpeg] Failed to load FFmpeg.wasm:', err);
    throw new Error(`FFmpeg 載入失敗: ${err instanceof Error ? err.message : '請重新整理頁面再試'}`);
  }
}

/**
 * Generate a black video segment (for gaps between clips).
 */
async function generateBlackSegment(
  ffmpeg: FFmpeg,
  duration: number,
  filename: string,
): Promise<void> {
  await ffmpeg.exec([
    '-f', 'lavfi',
    '-i', `color=c=0x000000:s=1280x720:d=${duration}`,
    '-f', 'lavfi',
    '-i', `anullsrc=r=44100:cl=stereo`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-t', `${duration}`,
    '-y', filename,
  ]);
}

/**
 * Export the full timeline to a single MP4.
 * Strategy: build chronological segments (title, clips, gaps, outro),
 * concatenate, burn subtitles, mix music.
 */
export async function exportVideo(
  state: EditorState,
  onProgress: (percent: number) => void,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const { clips, subtitles, musicClips, sfx, titleCard, outroCard } = state;

  if (clips.length === 0) throw new Error('沒有影片片段可匯出');

  const concatParts: string[] = [];
  let partIndex = 0;

  onProgress(5);

  // --- Title card ---
  if (titleCard) {
    const dur = titleCard.durationSeconds;
    const filename = `title.mp4`;
    await ffmpeg.exec([
      '-f', 'lavfi',
      '-i', `color=c=${titleCard.backgroundColor.replace('#', '0x')}:s=1280x720:d=${dur}`,
      '-vf', `drawtext=text='${escapeFFmpegText(titleCard.text)}':fontsize=48:fontcolor=${titleCard.textColor.replace('#', '0x')}:x=(w-text_w)/2:y=(h-text_h)/2${titleCard.subtitle ? `,drawtext=text='${escapeFFmpegText(titleCard.subtitle)}':fontsize=28:fontcolor=${titleCard.textColor.replace('#', '0x')}:x=(w-text_w)/2:y=(h+text_h)/2+20` : ''}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-t', `${dur}`,
      filename,
    ]);
    concatParts.push(filename);
    partIndex++;
  }

  // --- Process clips in chronological order, inserting gap segments ---
  const sorted = clipsSortedByPosition(clips);
  let cursor = titleCard ? titleCard.durationSeconds : 0; // current timeline position

  for (let i = 0; i < sorted.length; i++) {
    const clip = sorted[i];
    const clipStart = clip.timelinePosition;
    const clipDur = getClipDuration(clip);

    // Gap before this clip?
    const gapDur = clipStart - cursor;
    if (gapDur > 0.05) {
      const gapFile = `gap${partIndex}.mp4`;
      await generateBlackSegment(ffmpeg, gapDur, gapFile);
      concatParts.push(gapFile);
      partIndex++;
    }

    // Process the clip
    const inputName = `input${i}.mp4`;
    const outputName = `clip${partIndex}.mp4`;

    if (!clip.blobUrl) {
      throw new Error(`片段 ${i + 1} 沒有影片資料，請重新載入頁面`);
    }

    console.log(`[FFmpeg] Loading clip ${i + 1}: ${clip.blobUrl.substring(0, 50)}...`);
    let data: Uint8Array;
    try {
      data = await fetchFile(clip.blobUrl);
    } catch (err) {
      console.error(`[FFmpeg] Failed to fetch clip ${i + 1}:`, err);
      throw new Error(`無法載入片段 ${i + 1}，影片可能已過期，請重新載入頁面`);
    }
    await ffmpeg.writeFile(inputName, data);

    // Build filter chain
    const filters: string[] = [];

    // Trim
    const trimFilter = `trim=start=${clip.trimStart}:end=${clip.trimEnd},setpts=PTS-STARTPTS`;
    filters.push(trimFilter);

    // Speed
    if (clip.speed !== 1) {
      filters.push(`setpts=PTS/${clip.speed}`);
    }

    // Visual filter
    if (clip.filter && FFMPEG_FILTERS[clip.filter]) {
      filters.push(FFMPEG_FILTERS[clip.filter]);
    }

    // Scale to consistent size
    filters.push('scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1:color=black');

    const vf = filters.join(',');

    // Audio processing
    const audioFilters: string[] = [];
    audioFilters.push(`atrim=start=${clip.trimStart}:end=${clip.trimEnd},asetpts=PTS-STARTPTS`);
    if (clip.speed !== 1) {
      const tempo = Math.max(0.5, Math.min(2.0, clip.speed));
      audioFilters.push(`atempo=${tempo}`);
    }
    audioFilters.push(`volume=${clip.volume}`);
    const af = audioFilters.join(',');

    await ffmpeg.exec([
      '-i', inputName,
      '-vf', vf,
      '-af', af,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-y', outputName,
    ]);

    concatParts.push(outputName);
    partIndex++;

    cursor = clipStart + clipDur;

    onProgress(5 + Math.round((i + 1) / sorted.length * 50));
  }

  // --- Gap before outro? ---
  if (outroCard) {
    const outroStart = getOutroStart(state);
    const gapBeforeOutro = outroStart - cursor;
    if (gapBeforeOutro > 0.05) {
      const gapFile = `gap_outro${partIndex}.mp4`;
      await generateBlackSegment(ffmpeg, gapBeforeOutro, gapFile);
      concatParts.push(gapFile);
      partIndex++;
    }

    const dur = outroCard.durationSeconds;
    const filename = `outro.mp4`;
    await ffmpeg.exec([
      '-f', 'lavfi',
      '-i', `color=c=${outroCard.backgroundColor.replace('#', '0x')}:s=1280x720:d=${dur}`,
      '-vf', `drawtext=text='${escapeFFmpegText(outroCard.text)}':fontsize=48:fontcolor=${outroCard.textColor.replace('#', '0x')}:x=(w-text_w)/2:y=(h-text_h)/2${outroCard.subtitle ? `,drawtext=text='${escapeFFmpegText(outroCard.subtitle)}':fontsize=28:fontcolor=${outroCard.textColor.replace('#', '0x')}:x=(w-text_w)/2:y=(h+text_h)/2+20` : ''}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-t', `${dur}`,
      filename,
    ]);
    concatParts.push(filename);
  }

  onProgress(60);

  // --- Concatenate all parts ---
  const concatList = concatParts.map(f => `file '${f}'`).join('\n');
  await ffmpeg.writeFile('concat.txt', concatList);

  const concatArgs = [
    '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
  ];

  // --- Subtitles (burn-in via ASS) ---
  if (subtitles.length > 0) {
    const assContent = generateASS(subtitles, state);
    await ffmpeg.writeFile('subtitles.ass', assContent);
    concatArgs.push('-vf', 'ass=subtitles.ass');
  }

  const outputFile = 'output_no_music.mp4';
  concatArgs.push('-y', outputFile);

  console.log('[FFmpeg] Concatenating clips...');
  try {
    await ffmpeg.exec(concatArgs);
  } catch (err) {
    console.error('[FFmpeg] Concatenation failed:', err);
    throw new Error(`影片合併失敗: ${err instanceof Error ? err.message : '請重新整理頁面再試'}`);
  }

  onProgress(80);

  // --- Mix music clips if present ---
  let finalFile = outputFile;
  if (musicClips.length > 0) {
    const prevFile = finalFile;
    const musicInputs: string[] = ['-i', prevFile];
    const musicFilterParts: string[] = [];
    const musicCleanup: string[] = [];

    for (let i = 0; i < musicClips.length; i++) {
      const mc = musicClips[i];
      const musicFilename = `music${i}.mp3`;
      const musicData = await fetchFile(mc.blobUrl);
      await ffmpeg.writeFile(musicFilename, musicData);
      musicCleanup.push(musicFilename);

      musicInputs.push('-i', musicFilename);
      const delayMs = Math.round(mc.timelinePosition * 1000);
      // Input index is i+1 (0 is the video file)
      musicFilterParts.push(
        `[${i + 1}:a]atrim=start=${mc.trimStart}:end=${mc.trimEnd},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${mc.volume}[mc${i}]`
      );
    }

    // Mix all music clips with original audio
    const musicLabels = musicClips.map((_, i) => `[mc${i}]`).join('');
    const mixFilter = musicFilterParts.join(';') +
      `;[0:a]${musicLabels}amix=inputs=${musicClips.length + 1}:duration=first:dropout_transition=2[aout]`;

    finalFile = 'final_with_music.mp4';
    await ffmpeg.exec([
      ...musicInputs,
      '-filter_complex', mixFilter,
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      '-y', finalFile,
    ]);

    // Cleanup music temp files
    for (const f of musicCleanup) {
      await ffmpeg.deleteFile(f).catch(() => {});
    }
    if (prevFile !== outputFile) {
      await ffmpeg.deleteFile(prevFile).catch(() => {});
    }
  }

  // --- Mix SFX if present ---
  if (sfx.length > 0) {
    const prevFile = finalFile;
    const sfxInputs: string[] = ['-i', prevFile];
    const sfxFilterParts: string[] = [];
    const sfxCleanup: string[] = [];

    for (let i = 0; i < sfx.length; i++) {
      const sfxItem = sfx[i];
      const sfxFilename = `sfx${i}.mp3`;
      const sfxData = await fetchFile(sfxItem.blobUrl);
      await ffmpeg.writeFile(sfxFilename, sfxData);
      sfxCleanup.push(sfxFilename);

      sfxInputs.push('-i', sfxFilename);
      const delayMs = Math.round(sfxItem.startTime * 1000);
      // Input index is i+1 (0 is the video file)
      sfxFilterParts.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs},volume=${sfxItem.volume}[sfx${i}]`);
    }

    // Mix all SFX with original audio
    const sfxLabels = sfx.map((_, i) => `[sfx${i}]`).join('');
    const mixFilter = sfxFilterParts.join(';') +
      `;[0:a]${sfxLabels}amix=inputs=${sfx.length + 1}:duration=first:dropout_transition=2[aout]`;

    const sfxOutFile = 'final_with_sfx.mp4';
    await ffmpeg.exec([
      ...sfxInputs,
      '-filter_complex', mixFilter,
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      '-y', sfxOutFile,
    ]);

    finalFile = sfxOutFile;

    // Cleanup SFX temp files
    for (const f of sfxCleanup) {
      await ffmpeg.deleteFile(f).catch(() => {});
    }
    if (prevFile !== outputFile) {
      await ffmpeg.deleteFile(prevFile).catch(() => {});
    }
  }

  onProgress(95);

  // --- Read result ---
  console.log(`[FFmpeg] Reading final file: ${finalFile}`);
  let result: Uint8Array | string;
  try {
    result = await ffmpeg.readFile(finalFile);
  } catch (err) {
    console.error('[FFmpeg] Failed to read output file:', err);
    throw new Error(`無法讀取匯出檔案: ${err instanceof Error ? err.message : '記憶體可能不足，請嘗試較短的影片'}`);
  }

  const bytes = result instanceof Uint8Array ? new Uint8Array(result) : new TextEncoder().encode(result as string);
  if (bytes.length === 0) {
    throw new Error('匯出檔案為空，FFmpeg 處理可能失敗。請檢查影片來源。');
  }
  console.log(`[FFmpeg] Output file size: ${bytes.length} bytes`);
  const blob = new Blob([bytes.buffer], { type: 'video/mp4' });

  // Cleanup
  for (const part of concatParts) {
    await ffmpeg.deleteFile(part).catch(() => {});
  }
  await ffmpeg.deleteFile('concat.txt').catch(() => {});
  await ffmpeg.deleteFile(outputFile).catch(() => {});
  if (finalFile !== outputFile) await ffmpeg.deleteFile(finalFile).catch(() => {});
  for (let i = 0; i < clips.length; i++) {
    await ffmpeg.deleteFile(`input${i}.mp4`).catch(() => {});
  }
  await ffmpeg.deleteFile('subtitles.ass').catch(() => {});
  await ffmpeg.deleteFile('final_with_music.mp4').catch(() => {});
  await ffmpeg.deleteFile('final_with_sfx.mp4').catch(() => {});

  onProgress(100);
  return blob;
}

// --- Helpers ---

function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%');
}

function generateASS(
  subtitles: EditorState['subtitles'],
  _state: EditorState,
): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Bottom,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,30,1
Style: Top,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,8,10,10,30,1
Style: Center,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,5,10,10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = subtitles.map(sub => {
    const style = sub.position === 'top' ? 'Top' : sub.position === 'center' ? 'Center' : 'Bottom';
    const start = formatASSTime(sub.startTime);
    const end = formatASSTime(sub.endTime);
    const hasCustomPos = sub.x !== undefined && sub.y !== undefined;
    const posTag = hasCustomPos
      ? `{\\pos(${Math.round((sub.x ?? 0.5) * 1280)},${Math.round((sub.y ?? 0.88) * 720)})}`
      : '';
    return `Dialogue: 0,${start},${end},${style},,0,0,0,,${posTag}${sub.text}`;
  });

  return header + events.join('\n') + '\n';
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
