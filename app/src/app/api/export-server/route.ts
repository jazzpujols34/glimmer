export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { captureError } from '@/lib/errors';
import { checkCredits } from '@/lib/credits';

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

    console.log(`[export-server] Starting export for job ${jobId}, ${clips.length} clips`);

    // Determine if watermark should be applied (free tier users only)
    let applyWatermark = true;  // Default: apply watermark
    if (email) {
      const credits = await checkCredits(email);
      // No watermark for: admins, or users who have ever purchased credits
      if (credits.isAdmin || credits.paidTotal > 0) {
        applyWatermark = false;
      }
    }
    console.log(`[export-server] Watermark: ${applyWatermark} (email: ${email || 'none'})`);

    if (!jobId || !clips || clips.length === 0) {
      return NextResponse.json(
        { error: 'Missing jobId or clips' },
        { status: 400 }
      );
    }

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
      let videoUrl: string;
      const sourceUrl = clip.sourceUrl || '';

      console.log(`[export-server] Clip ${idx}: sourceUrl=${sourceUrl.substring(0, 80)}...`);

      if (!sourceUrl) {
        console.warn(`[export-server] Clip ${idx} has no sourceUrl, using fallback`);
        videoUrl = `${BASE_URL}/api/proxy-video?jobId=${encodeURIComponent(jobId)}&index=${idx}`;
      } else if (sourceUrl.startsWith('local://')) {
        // Local file - cannot be exported server-side!
        console.error(`[export-server] Clip ${idx} is a local file: ${sourceUrl}`);
        return NextResponse.json(
          { error: `片段 ${idx + 1} 是本機檔案，無法使用伺服器匯出。請使用瀏覽器匯出，或從影片庫選擇片段。` },
          { status: 400 }
        );
      } else if (sourceUrl.startsWith('http')) {
        // CDN URL - use directly
        videoUrl = sourceUrl;
      } else if (sourceUrl.startsWith('/api/proxy-video')) {
        // Already a proxy URL - make it absolute
        videoUrl = `${BASE_URL}${sourceUrl}`;
      } else if (sourceUrl.startsWith('uploads/')) {
        // Uploaded local file stored in R2 - use proxy-r2 endpoint
        videoUrl = `${BASE_URL}/api/proxy-r2?key=${encodeURIComponent(sourceUrl)}`;
      } else {
        // R2 key - need to find the video index and use proxy
        // Extract jobId from R2 key pattern: videos/{jobId}/{index}.mp4
        const r2Match = sourceUrl.match(/videos\/([^/]+)\/(\d+)\.mp4/);
        if (r2Match) {
          const [, r2JobId, r2Index] = r2Match;
          videoUrl = `${BASE_URL}/api/proxy-video?jobId=${encodeURIComponent(r2JobId)}&index=${r2Index}`;
        } else if (sourceUrl.includes('/')) {
          // Some other R2 key format - try direct R2 proxy
          videoUrl = `${BASE_URL}/api/proxy-r2?key=${encodeURIComponent(sourceUrl)}`;
        } else {
          // Unknown format - try using current job as fallback
          console.warn(`[export-server] Clip ${idx} has unknown sourceUrl format: ${sourceUrl}`);
          videoUrl = `${BASE_URL}/api/proxy-video?jobId=${encodeURIComponent(jobId)}&index=${idx}`;
        }
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

    console.log(`[export-server] Calling Cloud Run async service at ${CLOUD_RUN_URL}...`);

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
        console.error(`[export-server] Cloud Run error: ${response.status} ${errorText}`);
        return NextResponse.json(
          { error: `匯出服務錯誤: ${response.status}` },
          { status: 502 }
        );
      }

      const result = await response.json();
      console.log(`[export-server] Cloud Run async response:`, result);

      // Return exportId for client to poll
      return NextResponse.json({
        success: true,
        exportId: result.exportId,
        status: 'processing',
      });
    } catch (fetchError) {
      console.error(`[export-server] Fetch error:`, fetchError);
      throw fetchError;
    }

  } catch (error) {
    captureError(error, { route: '/api/export-server' });
    console.error('[export-server] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '匯出失敗' },
      { status: 500 }
    );
  }
}
