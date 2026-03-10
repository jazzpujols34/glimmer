export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { captureError } from '@/lib/errors';
import { checkCredits } from '@/lib/credits';
import { resolveVideoUrl } from '@/lib/video-url';
import { logger } from '@/lib/logger';

/**
 * Server-side video export via Cloud Run.
 *
 * This endpoint:
 * 1. Receives export request with clip indices and edit data
 * 2. Builds URLs for Cloud Run to fetch videos (via proxy endpoint)
 * 3. Calls Cloud Run FFmpeg service
 * 4. Returns download URL for the exported video
 */

interface ClipExportData {
  sourceUrl: string;  // R2 key or CDN URL
  trimStart: number;
  trimEnd: number;
  speed: number;
  volume: number;
  filter: string | null;
}

interface SubtitleExportData {
  text: string;
  startTime: number;
  endTime: number;
  position: string;
  x?: number;
  y?: number;
}

interface MusicExportData {
  src: string;  // filename for bundled, or URL
  type: 'bundled' | 'uploaded';
  timelinePosition: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

interface TitleCardExportData {
  text: string;
  subtitle?: string;
  durationSeconds: number;
  backgroundColor: string;
  textColor: string;
}

interface TransitionExportData {
  type: string;  // 'none' | 'fade' | 'fadeblack' | 'wipeleft' | etc.
  durationMs: number;
}

interface ExportRequest {
  jobId: string;
  clips: ClipExportData[];
  transitions: TransitionExportData[];  // transitions[i] = between clips[i] and clips[i+1]
  subtitles: SubtitleExportData[];
  musicClips: MusicExportData[];
  titleCard?: TitleCardExportData;
  outroCard?: TitleCardExportData;
  email?: string;  // For watermark decision based on user tier
}

const CLOUD_RUN_URL = process.env.EXPORT_SERVICE_URL;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://glimmer.video';

export async function POST(request: NextRequest) {
  try {
    const body: ExportRequest = await request.json();
    const { jobId, clips, transitions, subtitles, musicClips, titleCard, outroCard, email } = body;

    if (!jobId || !clips || clips.length === 0) {
      return NextResponse.json(
        { error: 'Missing jobId or clips' },
        { status: 400 }
      );
    }

    logger.debug('export-server', `Starting export for job ${jobId}, ${clips.length} clips`);

    // Determine if watermark should be applied (free tier users only)
    let applyWatermark = true;  // Default: apply watermark
    if (email) {
      const credits = await checkCredits(email);
      // No watermark for: admins, or users who have ever purchased credits
      if (credits.isAdmin || credits.paidTotal > 0) {
        applyWatermark = false;
      }
    }
    logger.debug('export-server', `Watermark: ${applyWatermark} (email: ${email || 'none'})`);

    if (!CLOUD_RUN_URL) {
      return NextResponse.json(
        { error: '伺服器匯出服務尚未設定，請使用瀏覽器匯出' },
        { status: 503 }
      );
    }

    // Build clip data with accessible URLs for Cloud Run
    const clipDataForService: Array<{
      url: string;
      trimStart: number;
      trimEnd: number;
      speed: number;
      volume: number;
      filter: string | null;
    }> = [];

    for (let idx = 0; idx < clips.length; idx++) {
      const clip = clips[idx];
      const sourceUrl = clip.sourceUrl || '';

      logger.debug('export-server', `Clip ${idx}: sourceUrl=${sourceUrl.substring(0, 80)}...`);

      // Check for local files which cannot be exported server-side
      if (sourceUrl.startsWith('local://')) {
        logger.error(`[export-server] Clip ${idx} is a local file: ${sourceUrl}`);
        return NextResponse.json(
          {
            error: `片段 ${idx + 1} 是本機檔案，無法使用伺服器匯出。請使用瀏覽器匯出，或從影片庫選擇片段。`,
            code: 'LOCAL_FILE_NOT_SUPPORTED'
          },
          { status: 400 }
        );
      }

      // Use resolveVideoUrl for consistent URL resolution
      const videoUrl = sourceUrl
        ? resolveVideoUrl(sourceUrl, 'export', BASE_URL)
        : `${BASE_URL}/api/proxy-video?jobId=${encodeURIComponent(jobId)}&index=${idx}`;

      if (!videoUrl) {
        return NextResponse.json(
          {
            error: `片段 ${idx + 1} 的影片連結無效。`,
            code: 'INVALID_VIDEO_URL'
          },
          { status: 400 }
        );
      }

      clipDataForService.push({
        url: videoUrl,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        speed: clip.speed,
        volume: clip.volume,
        filter: clip.filter,
      });
    }

    // Pre-validate all clip URLs before sending to Cloud Run
    logger.debug('export-server', `Validating ${clipDataForService.length} clip URLs...`);
    for (let idx = 0; idx < clipDataForService.length; idx++) {
      const clipData = clipDataForService[idx];
      try {
        const testRes = await fetch(clipData.url, { method: 'HEAD' });
        if (!testRes.ok) {
          logger.error(`[export-server] Clip ${idx} URL validation failed: ${testRes.status}`);
          return NextResponse.json(
            {
              error: `影片 ${idx + 1} 無法存取，可能已過期。請返回重新選擇影片。`,
              code: 'CLIP_UNREACHABLE',
              details: `Clip ${idx + 1} returned HTTP ${testRes.status}`
            },
            { status: 400 }
          );
        }
      } catch (err) {
        logger.error(`[export-server] Clip ${idx} URL fetch error:`, err);
        return NextResponse.json(
          {
            error: `無法連接影片來源，請稍後再試。`,
            code: 'CLIP_FETCH_ERROR',
            details: `Clip ${idx + 1}: ${(err as Error).message}`
          },
          { status: 502 }
        );
      }
    }
    logger.debug('export-server', 'All clip URLs validated successfully');

    // Build music URLs
    const musicDataForService = musicClips.map((mc) => {
      let musicUrl: string;
      if (mc.type === 'bundled') {
        // mc.src is just filename like "gentle-piano.mp3", not full path
        const filename = mc.src.replace(/^\/audio\/bundled\//, '').replace(/^audio\/bundled\//, '');
        musicUrl = `${BASE_URL}/audio/bundled/${filename}`;
      } else {
        // uploaded files already have full URL
        musicUrl = mc.src;
      }

      return {
        url: musicUrl,
        timelinePosition: mc.timelinePosition,
        trimStart: mc.trimStart,
        trimEnd: mc.trimEnd,
        volume: mc.volume,
        fadeInDuration: mc.fadeInDuration ?? 0,
        fadeOutDuration: mc.fadeOutDuration ?? 0,
      };
    });

    // Build request for Cloud Run service
    const cloudRunRequest = {
      jobId,
      clips: clipDataForService,
      transitions: transitions || [],  // transitions[i] = between clips[i] and clips[i+1]
      subtitles: subtitles.map(sub => ({
        text: sub.text,
        startTime: sub.startTime,
        endTime: sub.endTime,
        position: sub.position,
        x: sub.x,
        y: sub.y,
      })),
      musicClips: musicDataForService,
      titleCard,
      outroCard,
      resolution: '1280x720',
      watermark: applyWatermark,
    };

    logger.debug('export-server', `Calling Cloud Run async service at ${CLOUD_RUN_URL}...`);

    // Call Cloud Run async endpoint - returns immediately with exportId
    try {
      const response = await fetch(`${CLOUD_RUN_URL}/export-async`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cloudRunRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`[export-server] Cloud Run error: ${response.status} ${errorText}`);
        return NextResponse.json(
          { error: `匯出服務錯誤: ${response.status}` },
          { status: 502 }
        );
      }

      const result = await response.json();
      logger.debug('export-server', 'Cloud Run async response:', result);

      // Return exportId for client to poll
      return NextResponse.json({
        success: true,
        exportId: result.exportId,
        status: 'processing',
      });
    } catch (fetchError) {
      logger.error('[export-server] Fetch error:', fetchError);
      throw fetchError;
    }

  } catch (error) {
    captureError(error, { route: '/api/export-server' });
    logger.error('[export-server] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '匯出失敗' },
      { status: 500 }
    );
  }
}
