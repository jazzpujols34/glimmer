export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import {
  getQuickJob,
  updateQuickJob,
  getBatch,
  getJob,
  createStoryboard,
  updateStoryboard,
} from '@/lib/storage';
import { getTemplateById, buildTitleCard, buildOutroCard } from '@/lib/templates';
import { captureError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { checkCredits } from '@/lib/credits';
import type { StoryboardSlot, StoryboardClip, StoryboardTransitionType } from '@/types';

const CLOUD_RUN_URL = process.env.EXPORT_SERVICE_URL;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://glimmer.video';

interface SegmentStatus {
  index: number;
  jobId: string;
  status: string;
  progress?: number;
  videoUrl?: string;
}

/**
 * GET /api/quick-status/[id]
 *
 * Returns quick job status with batch progress.
 * Auto-triggers export when batch completes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: quickId } = await params;

    const quickJob = await getQuickJob(quickId);
    if (!quickJob) {
      return NextResponse.json(
        { error: '找不到快速生成任務' },
        { status: 404 }
      );
    }

    // Get batch status
    const batch = await getBatch(quickJob.batchId);
    if (!batch) {
      return NextResponse.json(
        { error: '找不到批次任務' },
        { status: 404 }
      );
    }

    // Get segment statuses
    const segments: SegmentStatus[] = [];
    for (const jobId of batch.segmentJobIds) {
      const job = await getJob(jobId);
      if (job) {
        segments.push({
          index: job.segmentIndex ?? segments.length,
          jobId,
          status: job.status,
          progress: job.progress,
          videoUrl: job.videoUrl,
        });
      }
    }
    segments.sort((a, b) => a.index - b.index);

    // Calculate overall progress
    const completedCount = segments.filter(s => s.status === 'complete').length;
    const failedCount = segments.filter(s => s.status === 'error').length;
    const totalSegments = batch.totalSegments;
    const generationProgress = Math.round((completedCount / totalSegments) * 100);

    // Check if batch just completed and we need to start export
    const batchComplete = completedCount + failedCount >= totalSegments;
    let exportStatus: string | undefined;
    let exportProgress: number | undefined;
    let videoUrl: string | undefined;

    if (batchComplete && quickJob.status === 'generating') {
      // Batch just completed - create storyboard and start export
      logger.debug('quick-status', `Batch ${batch.id} completed, starting export...`);

      try {
        const exportResult = await startQuickExport(quickJob, batch, segments);
        await updateQuickJob(quickId, {
          status: 'exporting',
          storyboardId: exportResult.storyboardId,
          exportId: exportResult.exportId,
        });
        exportStatus = 'processing';
      } catch (err) {
        logger.error('[quick-status] Export start failed:', err);
        await updateQuickJob(quickId, {
          status: 'error',
          error: err instanceof Error ? err.message : '匯出啟動失敗',
        });
      }
    } else if (quickJob.status === 'exporting' && quickJob.exportId) {
      // Check export status
      try {
        const exportCheck = await checkExportStatus(quickJob.exportId);
        exportStatus = exportCheck.status;
        exportProgress = exportCheck.progress;

        if (exportCheck.status === 'complete' && exportCheck.r2Key) {
          await updateQuickJob(quickId, {
            status: 'complete',
            videoR2Key: exportCheck.r2Key,
          });
          videoUrl = `${BASE_URL}/api/proxy-r2?key=${encodeURIComponent(exportCheck.r2Key)}`;
        } else if (exportCheck.status === 'error') {
          await updateQuickJob(quickId, {
            status: 'error',
            error: exportCheck.error || '匯出失敗',
          });
        }
      } catch (err) {
        logger.error('[quick-status] Export check failed:', err);
      }
    } else if (quickJob.status === 'complete' && quickJob.videoR2Key) {
      exportStatus = 'complete';
      exportProgress = 100;
      videoUrl = `${BASE_URL}/api/proxy-r2?key=${encodeURIComponent(quickJob.videoR2Key)}`;
    }

    // Reload to get latest status
    const updatedQuickJob = await getQuickJob(quickId);

    return NextResponse.json({
      quickId,
      status: updatedQuickJob?.status || quickJob.status,
      name: quickJob.name,
      templateId: quickJob.templateId,
      batchId: quickJob.batchId,
      totalSegments,
      completedSegments: completedCount,
      failedSegments: failedCount,
      generationProgress,
      segments,
      exportStatus,
      exportProgress,
      videoUrl,
      error: updatedQuickJob?.error || quickJob.error,
      createdAt: quickJob.createdAt,
    });
  } catch (error) {
    captureError(error, { route: '/api/quick-status/[id]' });
    logger.error('[quick-status] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得狀態失敗' },
      { status: 500 }
    );
  }
}

/**
 * Create storyboard from completed segments and start export
 */
async function startQuickExport(
  quickJob: Awaited<ReturnType<typeof getQuickJob>>,
  batch: Awaited<ReturnType<typeof getBatch>>,
  segments: SegmentStatus[]
) {
  if (!quickJob || !batch) throw new Error('Missing job or batch');

  const template = getTemplateById(quickJob.templateId);
  if (!template) throw new Error('Template not found');

  // Get completed segments with videos
  const completedSegments = segments
    .filter(s => s.status === 'complete' && s.videoUrl)
    .sort((a, b) => a.index - b.index);

  if (completedSegments.length === 0) {
    throw new Error('No completed segments');
  }

  // Create storyboard
  const storyboard = await createStoryboard(
    quickJob.name,
    completedSegments.length,
    '16:9',
    quickJob.email
  );

  // Build title and outro cards
  const userInputs = {
    name: quickJob.name,
    date: quickJob.date,
    message: quickJob.message,
  };
  const titleCard = buildTitleCard(template, userInputs);
  const outroCard = buildOutroCard(template, userInputs);

  // Fill slots with completed videos
  const slots: StoryboardSlot[] = completedSegments.map((segment, index) => {
    const clip: StoryboardClip = {
      sourceType: 'gallery',
      jobId: segment.jobId,
      videoUrl: segment.videoUrl!,
      duration: 5, // AI clips are ~5s
      fitMode: 'letterbox',
    };

    return {
      id: `slot_${index}`,
      index,
      status: 'filled' as const,
      clip,
    };
  });

  // Set transitions to template's transition type
  const transitions: StoryboardTransitionType[] = new Array(Math.max(0, slots.length - 1))
    .fill(template.transition);

  // Update storyboard with everything
  await updateStoryboard(storyboard.id, {
    slots,
    transitions,
    titleCard,
    outroCard,
    music: template.music,
  });

  logger.debug('quick-status', `Created storyboard ${storyboard.id} with ${slots.length} slots`);

  // Start export
  if (!CLOUD_RUN_URL) {
    throw new Error('Export service not configured');
  }

  // Build clips for Cloud Run
  const clips = completedSegments.map(segment => {
    let videoUrl = segment.videoUrl!;

    // Transform R2 keys to proxy URLs
    if (!videoUrl.startsWith('http')) {
      const r2Match = videoUrl.match(/videos\/([^/]+)\/(\d+)\.mp4/);
      if (r2Match) {
        const [, r2JobId, r2Index] = r2Match;
        videoUrl = `${BASE_URL}/api/proxy-video?jobId=${encodeURIComponent(r2JobId)}&index=${r2Index}`;
      } else {
        videoUrl = `${BASE_URL}/api/proxy-r2?key=${encodeURIComponent(videoUrl)}`;
      }
    }

    return {
      url: videoUrl,
      trimStart: 0,
      trimEnd: 5,
      speed: 1.0,
      volume: 1.0,
      filter: null,
    };
  });

  // Calculate total duration
  const totalDuration = clips.reduce((sum, clip) => sum + clip.trimEnd, 0)
    + titleCard.durationSeconds
    + outroCard.durationSeconds;

  // Build music
  const musicClips = [{
    url: `${BASE_URL}/audio/bundled/${template.music.src}`,
    timelinePosition: 0,
    trimStart: 0,
    trimEnd: totalDuration,
    volume: template.music.volume,
  }];

  // Determine watermark
  let applyWatermark = true;
  if (quickJob.email) {
    const credits = await checkCredits(quickJob.email);
    if (credits.isAdmin || credits.paidTotal > 0) {
      applyWatermark = false;
    }
  }

  const cloudRunRequest = {
    jobId: storyboard.id,
    clips,
    subtitles: [],
    musicClips,
    titleCard,
    outroCard,
    resolution: '1280x720',
    watermark: applyWatermark,
  };

  logger.debug('quick-status', `Calling Cloud Run with ${clips.length} clips`);

  const response = await fetch(`${CLOUD_RUN_URL}/export-async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cloudRunRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Export service error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  logger.debug('quick-status', `Export started: ${result.exportId}`);

  return {
    storyboardId: storyboard.id,
    exportId: result.exportId,
  };
}

/**
 * Check export status from Cloud Run
 */
async function checkExportStatus(exportId: string): Promise<{
  status: string;
  progress?: number;
  r2Key?: string;
  error?: string;
}> {
  if (!CLOUD_RUN_URL) {
    return { status: 'error', error: 'Export service not configured' };
  }

  const response = await fetch(`${CLOUD_RUN_URL}/export-status/${exportId}`);
  if (!response.ok) {
    return { status: 'error', error: `Status check failed: ${response.status}` };
  }

  const data = await response.json();

  return {
    status: data.status,
    progress: data.progress,
    r2Key: data.r2_key,
    error: data.error,
  };
}
