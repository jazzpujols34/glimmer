export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getStoryboard } from '@/lib/storage';
import { captureError } from '@/lib/errors';
import { checkCredits } from '@/lib/credits';
import { resolveVideoUrl } from '@/lib/video-url';
import { logger } from '@/lib/logger';

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

    logger.debug('storyboard-export', `Starting export for storyboard ${storyboardId}`);

    // Fetch storyboard
    const storyboard = await getStoryboard(storyboardId);
    if (!storyboard) {
      return NextResponse.json(
        { error: '找不到故事板' },
        { status: 404 }
      );
    }

    // Get content slots in order (video clips + text cards)
    const contentSlots = storyboard.slots
      .filter(slot => (slot.status === 'filled' && slot.clip) || (slot.status === 'text-card' && slot.textCard))
      .sort((a, b) => a.index - b.index);

    const filledSlots = contentSlots.filter(slot => slot.status === 'filled' && slot.clip);

    if (contentSlots.length === 0) {
      return NextResponse.json(
        { error: '故事板沒有內容' },
        { status: 400 }
      );
    }

    if (!CLOUD_RUN_URL) {
      return NextResponse.json(
        { error: '匯出服務尚未設定' },
        { status: 503 }
      );
    }

    // Build clips and interstitial cards for Cloud Run
    // We process contentSlots in order, building a mixed sequence
    const clips: Array<{
      url: string;
      trimStart: number;
      trimEnd: number;
      speed: number;
      volume: number;
      filter: string | null;
    }> = [];

    // Interstitial cards: { position, card } — position = index in clips array where card is inserted BEFORE
    const interstitialCards: Array<{
      position: number;
      text: string;
      subtitle?: string;
      durationSeconds: number;
      backgroundColor: string;
      textColor: string;
      templateId?: string;
      backgroundImage?: string;
    }> = [];

    let clipIndex = 0;
    for (const slot of contentSlots) {
      if (slot.status === 'text-card' && slot.textCard) {
        interstitialCards.push({
          position: clipIndex,
          text: slot.textCard.text,
          subtitle: slot.textCard.subtitle,
          durationSeconds: slot.textCard.durationSeconds,
          backgroundColor: slot.textCard.backgroundColor,
          textColor: slot.textCard.textColor,
          templateId: slot.textCard.templateId,
          backgroundImage: slot.textCard.backgroundImage
            ? `${BASE_URL}/backgrounds/${slot.textCard.backgroundImage}`
            : undefined,
        });
        logger.debug('storyboard-export', `Slot ${slot.index}: text card "${slot.textCard.text}" at position ${clipIndex}`);
        continue;
      }

      if (slot.status === 'filled' && slot.clip) {
        const clip = slot.clip;
        const sourceUrl = clip.videoUrl || '';
        logger.debug('storyboard-export', `Slot ${slot.index}: sourceUrl=${sourceUrl.substring(0, 80)}...`);

        if (!sourceUrl) {
          logger.warn(`[storyboard-export] Slot ${slot.index} has no videoUrl`);
          continue;
        }

        const videoUrl = resolveVideoUrl(sourceUrl, 'export', BASE_URL);
        if (!videoUrl) {
          logger.warn(`[storyboard-export] Slot ${slot.index} has invalid videoUrl`);
          continue;
        }

        clips.push({
          url: videoUrl,
          trimStart: clip.trimStart ?? 0,
          trimEnd: clip.trimEnd ?? clip.duration,
          speed: 1.0,
          volume: 1.0,
          filter: null,
        });
        clipIndex++;
      }
    }

    // Pre-validate all clip URLs before sending to Cloud Run
    logger.debug('storyboard-export', `Validating ${clips.length} clip URLs...`);
    for (let idx = 0; idx < clips.length; idx++) {
      const clipData = clips[idx];
      try {
        const testRes = await fetch(clipData.url, { method: 'HEAD' });
        if (!testRes.ok) {
          logger.error(`[storyboard-export] Clip ${idx} URL validation failed: ${testRes.status}`);
          return NextResponse.json(
            {
              error: `影片 ${idx + 1} 無法存取，可能已過期。請返回重新選擇影片。`,
              code: 'CLIP_UNREACHABLE',
            },
            { status: 400 }
          );
        }
      } catch (err) {
        logger.error(`[storyboard-export] Clip ${idx} URL fetch error:`, err);
        return NextResponse.json(
          {
            error: `無法連接影片來源，請稍後再試。`,
            code: 'CLIP_FETCH_ERROR',
          },
          { status: 502 }
        );
      }
    }
    logger.debug('storyboard-export', 'All clip URLs validated successfully');

    if (clips.length === 0) {
      return NextResponse.json(
        { error: '無法處理任何影片片段' },
        { status: 400 }
      );
    }

    // Determine resolution based on aspect ratio
    const resolution = storyboard.aspectRatio === '16:9' ? '1280x720' : '720x1280';

    // Calculate total duration (clips use trimEnd-trimStart, not full duration)
    const totalDuration = clips.reduce((sum, clip) => sum + (clip.trimEnd - clip.trimStart), 0)
      + interstitialCards.reduce((sum, card) => sum + card.durationSeconds, 0)
      + (storyboard.titleCard?.durationSeconds || 0)
      + (storyboard.outroCard?.durationSeconds || 0);

    // Build music clips array — multi-track (musicTracks) or legacy (music)
    const musicClips: Array<{
      url: string;
      timelinePosition: number;
      trimStart: number;
      trimEnd: number;
      volume: number;
      fadeInDuration: number;
      fadeOutDuration: number;
    }> = [];

    const sourceTracks = storyboard.musicTracks || (
      storyboard.music ? [{
        id: 'legacy',
        type: storyboard.music.type,
        src: storyboard.music.src,
        name: storyboard.music.name,
        volume: storyboard.music.volume,
        timelinePosition: 0,
        trimStart: 0,
        trimEnd: totalDuration,
      }] : []
    );

    for (const track of sourceTracks) {
      let musicUrl: string;
      if (track.type === 'bundled') {
        musicUrl = `${BASE_URL}/audio/bundled/${track.src}`;
      } else {
        musicUrl = `${BASE_URL}/api/proxy-r2?key=${encodeURIComponent(track.src)}`;
      }

      musicClips.push({
        url: musicUrl,
        timelinePosition: track.timelinePosition,
        trimStart: track.trimStart,
        trimEnd: track.trimEnd,
        volume: track.volume,
        fadeInDuration: 'fadeInDuration' in track ? (track as unknown as { fadeInDuration: number }).fadeInDuration : 0,
        fadeOutDuration: 'fadeOutDuration' in track ? (track as unknown as { fadeOutDuration: number }).fadeOutDuration : 0,
      });

      logger.debug('storyboard-export', `Music track: ${track.name}, pos ${track.timelinePosition}s, vol ${track.volume}`);
    }

    // Build subtitles array
    const subtitles = (storyboard.subtitles || []).map(sub => ({
      text: sub.text,
      startTime: sub.startTime,
      endTime: sub.endTime,
      position: sub.position,
    }));

    // Determine if watermark should be applied (free tier users only)
    let applyWatermark = true;  // Default: apply watermark
    if (storyboard.email) {
      const credits = await checkCredits(storyboard.email);
      // No watermark for: admins, or users who have ever purchased credits
      if (credits.isAdmin || credits.paidTotal > 0) {
        applyWatermark = false;
      }
    }
    logger.debug('storyboard-export', `Watermark: ${applyWatermark} (email: ${storyboard.email || 'none'})`);

    // Resolve backgroundImage filenames to full URLs for Cloud Run
    const resolveBgImage = (card: typeof storyboard.titleCard) => {
      if (!card) return card;
      return {
        ...card,
        backgroundImage: card.backgroundImage
          ? `${BASE_URL}/backgrounds/${card.backgroundImage}`
          : undefined,
      };
    };

    // Build Cloud Run request
    const cloudRunRequest = {
      jobId: storyboardId,
      clips,
      subtitles,
      musicClips,
      interstitialCards: interstitialCards.length > 0 ? interstitialCards : undefined,
      titleCard: resolveBgImage(storyboard.titleCard),
      outroCard: resolveBgImage(storyboard.outroCard),
      resolution,
      watermark: applyWatermark,
    };

    logger.debug('storyboard-export', `Calling Cloud Run with ${clips.length} clips, resolution ${resolution}`);
    if (storyboard.titleCard) logger.debug('storyboard-export', `Including title card: ${storyboard.titleCard.text}`);
    if (storyboard.outroCard) logger.debug('storyboard-export', `Including outro card: ${storyboard.outroCard.text}`);

    // Call Cloud Run async endpoint
    const response = await fetch(`${CLOUD_RUN_URL}/export-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cloudRunRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[storyboard-export] Cloud Run error: ${response.status} ${errorText}`);
      return NextResponse.json(
        { error: `匯出服務錯誤: ${response.status}` },
        { status: 502 }
      );
    }

    const result = await response.json();
    logger.debug('storyboard-export', 'Cloud Run response:', result);

    return NextResponse.json({
      success: true,
      exportId: result.exportId,
      status: 'processing',
    });

  } catch (error) {
    captureError(error, { route: '/api/storyboards/[id]/export' });
    logger.error('[storyboard-export] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '匯出失敗' },
      { status: 500 }
    );
  }
}
