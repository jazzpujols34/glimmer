export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getStoryboard } from '@/lib/storage';
import { captureError } from '@/lib/errors';
import { checkCredits } from '@/lib/credits';

const CLOUD_RUN_URL = process.env.EXPORT_SERVICE_URL;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://glimmer.video';

/**
 * Export storyboard to video via Cloud Run FFmpeg service.
 *
 * Flow:
 * 1. Fetch storyboard from storage
 * 2. Extract filled slots in order
 * 3. Transform video URLs for Cloud Run accessibility
 * 4. Call Cloud Run /export-async
 * 5. Return exportId for polling
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: storyboardId } = await params;

    console.log(`[storyboard-export] Starting export for storyboard ${storyboardId}`);

    // Fetch storyboard
    const storyboard = await getStoryboard(storyboardId);
    if (!storyboard) {
      return NextResponse.json(
        { error: '找不到故事板' },
        { status: 404 }
      );
    }

    // Get filled slots in order
    const filledSlots = storyboard.slots
      .filter(slot => slot.status === 'filled' && slot.clip)
      .sort((a, b) => a.index - b.index);

    if (filledSlots.length === 0) {
      return NextResponse.json(
        { error: '故事板沒有影片' },
        { status: 400 }
      );
    }

    if (!CLOUD_RUN_URL) {
      return NextResponse.json(
        { error: '匯出服務尚未設定' },
        { status: 503 }
      );
    }

    // Build clips for Cloud Run
    const clips: Array<{
      url: string;
      trimStart: number;
      trimEnd: number;
      speed: number;
      volume: number;
      filter: string | null;
    }> = [];

    for (let i = 0; i < filledSlots.length; i++) {
      const slot = filledSlots[i];
      const clip = slot.clip!;
      let videoUrl: string;

      const sourceUrl = clip.videoUrl || '';
      console.log(`[storyboard-export] Slot ${slot.index}: sourceUrl=${sourceUrl.substring(0, 80)}...`);

      if (!sourceUrl) {
        console.warn(`[storyboard-export] Slot ${slot.index} has no videoUrl`);
        continue;
      }

      // Transform URL for Cloud Run accessibility
      if (sourceUrl.startsWith('http')) {
        // CDN URL - use directly
        videoUrl = sourceUrl;
      } else if (sourceUrl.startsWith('/api/proxy-video')) {
        // Already a proxy URL - make it absolute
        videoUrl = `${BASE_URL}${sourceUrl}`;
      } else if (sourceUrl.startsWith('uploads/')) {
        // Uploaded file stored in R2
        videoUrl = `${BASE_URL}/api/proxy-r2?key=${encodeURIComponent(sourceUrl)}`;
      } else {
        // R2 key - try pattern matching
        // Pattern: videos/{jobId}/{index}.mp4
        const r2Match = sourceUrl.match(/videos\/([^/]+)\/(\d+)\.mp4/);
        if (r2Match) {
          const [, r2JobId, r2Index] = r2Match;
          videoUrl = `${BASE_URL}/api/proxy-video?jobId=${encodeURIComponent(r2JobId)}&index=${r2Index}`;
        } else if (sourceUrl.includes('/')) {
          // Other R2 key format
          videoUrl = `${BASE_URL}/api/proxy-r2?key=${encodeURIComponent(sourceUrl)}`;
        } else {
          // Unknown format - skip this clip
          console.warn(`[storyboard-export] Unknown sourceUrl format: ${sourceUrl}`);
          continue;
        }
      }

      clips.push({
        url: videoUrl,
        trimStart: 0,
        trimEnd: clip.duration,
        speed: 1.0,
        volume: 1.0,
        filter: null,
      });
    }

    if (clips.length === 0) {
      return NextResponse.json(
        { error: '無法處理任何影片片段' },
        { status: 400 }
      );
    }

    // Determine resolution based on aspect ratio
    const resolution = storyboard.aspectRatio === '16:9' ? '1280x720' : '720x1280';

    // Calculate total duration for music
    const totalDuration = clips.reduce((sum, clip) => sum + clip.trimEnd, 0)
      + (storyboard.titleCard?.durationSeconds || 0)
      + (storyboard.outroCard?.durationSeconds || 0);

    // Build music clips array
    const musicClips: Array<{
      url: string;
      timelinePosition: number;
      trimStart: number;
      trimEnd: number;
      volume: number;
    }> = [];

    if (storyboard.music) {
      let musicUrl: string;
      if (storyboard.music.type === 'bundled') {
        musicUrl = `${BASE_URL}/audio/bundled/${storyboard.music.src}`;
      } else {
        // Uploaded music - use R2 proxy
        musicUrl = `${BASE_URL}/api/proxy-r2?key=${encodeURIComponent(storyboard.music.src)}`;
      }

      musicClips.push({
        url: musicUrl,
        timelinePosition: 0,
        trimStart: 0,
        trimEnd: totalDuration,
        volume: storyboard.music.volume,
      });

      console.log(`[storyboard-export] Including music: ${storyboard.music.name}, volume ${storyboard.music.volume}`);
    }

    // Determine if watermark should be applied (free tier users only)
    let applyWatermark = true;  // Default: apply watermark
    if (storyboard.email) {
      const credits = await checkCredits(storyboard.email);
      // No watermark for: admins, or users who have ever purchased credits
      if (credits.isAdmin || credits.paidTotal > 0) {
        applyWatermark = false;
      }
    }
    console.log(`[storyboard-export] Watermark: ${applyWatermark} (email: ${storyboard.email || 'none'})`);

    // Build Cloud Run request
    const cloudRunRequest = {
      jobId: storyboardId,
      clips,
      subtitles: [],
      musicClips,
      titleCard: storyboard.titleCard,
      outroCard: storyboard.outroCard,
      resolution,
      watermark: applyWatermark,
    };

    console.log(`[storyboard-export] Calling Cloud Run with ${clips.length} clips, resolution ${resolution}`);
    if (storyboard.titleCard) console.log(`[storyboard-export] Including title card: ${storyboard.titleCard.text}`);
    if (storyboard.outroCard) console.log(`[storyboard-export] Including outro card: ${storyboard.outroCard.text}`);

    // Call Cloud Run async endpoint
    const response = await fetch(`${CLOUD_RUN_URL}/export-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cloudRunRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[storyboard-export] Cloud Run error: ${response.status} ${errorText}`);
      return NextResponse.json(
        { error: `匯出服務錯誤: ${response.status}` },
        { status: 502 }
      );
    }

    const result = await response.json();
    console.log(`[storyboard-export] Cloud Run response:`, result);

    return NextResponse.json({
      success: true,
      exportId: result.exportId,
      status: 'processing',
    });

  } catch (error) {
    captureError(error, { route: '/api/storyboards/[id]/export' });
    console.error('[storyboard-export] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '匯出失敗' },
      { status: 500 }
    );
  }
}
