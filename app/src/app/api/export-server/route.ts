export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/storage';
import { captureError } from '@/lib/errors';

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
  index: number;
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

interface ExportRequest {
  jobId: string;
  clips: ClipExportData[];
  subtitles: SubtitleExportData[];
  musicClips: MusicExportData[];
  titleCard?: TitleCardExportData;
  outroCard?: TitleCardExportData;
}

const CLOUD_RUN_URL = process.env.EXPORT_SERVICE_URL;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://glimmer.video';

export async function POST(request: NextRequest) {
  try {
    const body: ExportRequest = await request.json();
    const { jobId, clips, subtitles, musicClips, titleCard, outroCard } = body;

    console.log(`[export-server] Starting export for job ${jobId}, ${clips.length} clips`);

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

    // Get job data to verify it exists and is complete
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'complete') {
      return NextResponse.json(
        { error: 'Job videos not ready' },
        { status: 400 }
      );
    }

    // Build clip data with proxy URLs that Cloud Run can access
    const clipDataForService = clips.map((clip) => {
      // Cloud Run will fetch videos via our proxy endpoint
      const proxyUrl = `${BASE_URL}/api/proxy-video?jobId=${encodeURIComponent(jobId)}&index=${clip.index}`;

      return {
        url: proxyUrl,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        speed: clip.speed,
        volume: clip.volume,
        filter: clip.filter,
      };
    });

    // Build music URLs
    const musicDataForService = musicClips.map((mc) => {
      const musicUrl = mc.type === 'bundled'
        ? `${BASE_URL}/audio/bundled/${mc.src}`
        : mc.src;  // uploaded files already have full URL

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
    };

    console.log(`[export-server] Calling Cloud Run service at ${CLOUD_RUN_URL}...`);

    // Call Cloud Run service with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 540000); // 9 min timeout

    try {
      const response = await fetch(`${CLOUD_RUN_URL}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cloudRunRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[export-server] Cloud Run error: ${response.status} ${errorText}`);
        return NextResponse.json(
          { error: `匯出服務錯誤: ${response.status}` },
          { status: 502 }
        );
      }

      const result = await response.json();
      console.log(`[export-server] Cloud Run response:`, result);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || '匯出失敗' },
          { status: 500 }
        );
      }

      // Build download URL via our proxy (Cloud Run uploaded to R2)
      const downloadUrl = result.r2Key
        ? `${BASE_URL}/api/export-download?key=${encodeURIComponent(result.r2Key)}`
        : undefined;

      return NextResponse.json({
        success: true,
        downloadUrl,
        durationSeconds: result.durationSeconds,
        fileSizeMB: result.fileSizeMB,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: '匯出逾時，影片可能太長。請嘗試減少片段數量。' },
          { status: 504 }
        );
      }
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
