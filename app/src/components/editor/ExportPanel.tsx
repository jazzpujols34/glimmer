'use client';

import { useState, useEffect } from 'react';
import { useEditor, useEditorDispatch } from './EditorContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { exportVideo } from '@/lib/editor/ffmpeg-export';
import { Download, Loader2, Film, CheckCircle, Server, Monitor, AlertTriangle } from 'lucide-react';
import { trackVideoExport } from '@/lib/analytics';
import { logger } from '@/lib/logger';

type ExportMode = 'browser' | 'server';

// Recommend server export for more than this many clips
const SERVER_EXPORT_THRESHOLD = 10;

export function ExportPanel() {
  const state = useEditor();
  const dispatch = useEditorDispatch();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState<ExportMode>('browser');
  const [serverExportStatus, setServerExportStatus] = useState<string | null>(null);

  // Auto-select server mode if many clips
  useEffect(() => {
    if (state.clips.length > SERVER_EXPORT_THRESHOLD) {
      setExportMode('server');
    }
  }, [state.clips.length]);

  // Revoke blob URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (downloadUrl && downloadUrl.startsWith('blob:')) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  const handleBrowserExport = async () => {
    setExporting(true);
    setProgress(0);
    setError(null);
    if (downloadUrl && downloadUrl.startsWith('blob:')) {
      URL.revokeObjectURL(downloadUrl);
    }
    setDownloadUrl(null);
    dispatch({ type: 'SET_EXPORT_PROGRESS', payload: 0 });

    try {
      const blob = await exportVideo(state, (pct) => {
        setProgress(pct);
        dispatch({ type: 'SET_EXPORT_PROGRESS', payload: pct });
      });

      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      dispatch({ type: 'SET_EXPORT_PROGRESS', payload: null });
      trackVideoExport('editor', state.totalDuration);
    } catch (err) {
      logger.error('Export failed:', err);
      setError(err instanceof Error ? err.message : '匯出失敗');
      dispatch({ type: 'SET_EXPORT_PROGRESS', payload: null });
    } finally {
      setExporting(false);
    }
  };

  const handleServerExport = async () => {
    // Check for local files - they can't be exported server-side
    const localFileClips = state.clips.filter(c => c.sourceUrl?.startsWith('local://'));
    if (localFileClips.length > 0) {
      setError(`有 ${localFileClips.length} 個本機檔案無法使用伺服器匯出。請使用瀏覽器匯出，或從影片庫選擇片段。`);
      return;
    }

    setExporting(true);
    setProgress(0);
    setError(null);
    setDownloadUrl(null);
    setServerExportStatus('正在準備匯出...');
    dispatch({ type: 'SET_EXPORT_PROGRESS', payload: 5 });

    try {
      // Debug: log sourceUrls
      logger.debug('ExportPanel', 'Clips to export:', state.clips.map((c, i) => ({
        index: i,
        sourceUrl: c.sourceUrl?.substring(0, 80),
      })));

      // Build export request
      const exportRequest = {
        jobId: state.jobId,
        email: state.email,  // For watermark decision based on user tier
        clips: state.clips.map((clip) => ({
          sourceUrl: clip.sourceUrl,
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd,
          speed: clip.speed,
          volume: clip.volume,
          filter: clip.filter,
        })),
        transitions: state.transitions.map(t => ({
          type: t.type,
          durationMs: t.durationMs,
        })),
        subtitles: state.subtitles.map(sub => ({
          text: sub.text,
          startTime: sub.startTime,
          endTime: sub.endTime,
          position: sub.position,
          x: sub.x,
          y: sub.y,
        })),
        musicClips: state.musicClips.map(mc => ({
          src: mc.src,
          type: mc.type,
          timelinePosition: mc.timelinePosition,
          trimStart: mc.trimStart,
          trimEnd: mc.trimEnd,
          volume: mc.volume,
        })),
        titleCard: state.titleCard,
        outroCard: state.outroCard,
      };

      setServerExportStatus('正在上傳至伺服器處理...');
      setProgress(10);
      dispatch({ type: 'SET_EXPORT_PROGRESS', payload: 10 });

      // Start async export
      const startResponse = await fetch('/api/export-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportRequest),
      });

      const startResult = await startResponse.json();

      if (!startResponse.ok || !startResult.success) {
        throw new Error(startResult.error || '伺服器匯出失敗');
      }

      const { exportId } = startResult;
      setServerExportStatus('伺服器處理中...');
      setProgress(20);

      // Poll for completion
      let pollCount = 0;
      const maxPolls = 120; // 10 minutes with 5s interval
      const pollInterval = 5000;

      while (pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;

        // Simulate progress (20% to 90% over polling period)
        const simulatedProgress = Math.min(90, 20 + (pollCount / maxPolls) * 70);
        setProgress(simulatedProgress);
        dispatch({ type: 'SET_EXPORT_PROGRESS', payload: simulatedProgress });

        const statusResponse = await fetch(`/api/export-status?exportId=${exportId}`);
        const statusResult = await statusResponse.json();

        if (statusResult.status === 'complete') {
          setProgress(100);
          dispatch({ type: 'SET_EXPORT_PROGRESS', payload: null });
          setServerExportStatus(null);

          if (statusResult.downloadUrl) {
            setDownloadUrl(statusResult.downloadUrl);
            trackVideoExport('server', state.totalDuration);
          } else {
            throw new Error('未收到下載連結');
          }
          return;
        }

        if (statusResult.status === 'error') {
          throw new Error(statusResult.error || '匯出失敗');
        }

        // Still processing, update status message
        setServerExportStatus(`伺服器處理中... (${Math.round(simulatedProgress)}%)`);
      }

      // Timeout after max polls
      throw new Error('匯出逾時，請重試或減少片段數量');

    } catch (err) {
      logger.error('Server export failed:', err);
      setError(err instanceof Error ? err.message : '伺服器匯出失敗');
      dispatch({ type: 'SET_EXPORT_PROGRESS', payload: null });
      setServerExportStatus(null);
    } finally {
      setExporting(false);
    }
  };

  const handleExport = () => {
    if (exportMode === 'server') {
      handleServerExport();
    } else {
      handleBrowserExport();
    }
  };

  const handleDownload = () => {
    if (!downloadUrl) return;

    if (downloadUrl.startsWith('blob:')) {
      // Browser export - trigger download
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${state.jobName || 'glimmer'}-edited.mp4`;
      a.click();
    } else {
      // Server export - open download URL
      window.open(downloadUrl, '_blank');
    }
  };

  const showServerRecommendation = state.clips.length > SERVER_EXPORT_THRESHOLD;
  const hasLocalFiles = state.clips.some(c => c.sourceUrl?.startsWith('local://'));
  const localFileCount = state.clips.filter(c => c.sourceUrl?.startsWith('local://')).length;

  return (
    <div className="p-4 space-y-5 overflow-y-auto">
      <h3 className="font-semibold text-sm">匯出影片</h3>

      {/* Summary */}
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>片段數量</span>
          <span className="font-medium text-foreground">{state.clips.length}</span>
        </div>
        <div className="flex justify-between">
          <span>總時長</span>
          <span className="font-medium text-foreground">{state.totalDuration.toFixed(1)}s</span>
        </div>
        <div className="flex justify-between">
          <span>字幕</span>
          <span className="font-medium text-foreground">{state.subtitles.length} 段</span>
        </div>
        <div className="flex justify-between">
          <span>背景音樂</span>
          <span className="font-medium text-foreground">{state.musicClips.length > 0 ? state.musicClips.length + ' 首' : '無'}</span>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Export mode selection */}
      {!downloadUrl && (
        <div className="space-y-3">
          <p className="text-xs font-medium">匯出方式</p>

          {showServerRecommendation && !hasLocalFiles && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                您有 {state.clips.length} 個片段，建議使用伺服器匯出以避免瀏覽器記憶體不足。
              </p>
            </div>
          )}

          {hasLocalFiles && exportMode === 'server' && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                有 {localFileCount} 個本機檔案無法使用伺服器匯出。請使用瀏覽器匯出。
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`p-3 rounded-lg border text-left transition-colors ${
                exportMode === 'browser'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/50'
              }`}
              onClick={() => setExportMode('browser')}
              disabled={exporting}
            >
              <Monitor className="w-4 h-4 mb-1" />
              <p className="text-xs font-medium">瀏覽器匯出</p>
              <p className="text-[10px] text-muted-foreground">適合 10 片段以下</p>
            </button>

            <button
              type="button"
              className={`p-3 rounded-lg border text-left transition-colors ${
                exportMode === 'server'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/50'
              }`}
              onClick={() => setExportMode('server')}
              disabled={exporting}
            >
              <Server className="w-4 h-4 mb-1" />
              <p className="text-xs font-medium">伺服器匯出</p>
              <p className="text-[10px] text-muted-foreground">支援 30+ 片段</p>
            </button>
          </div>

          {/* Mode description */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>匯出格式: MP4 (H.264 + AAC)</p>
            <p>解析度: 1280 x 720</p>
            {exportMode === 'browser' ? (
              <p>在您的瀏覽器中處理，不上傳影片</p>
            ) : (
              <p>上傳至伺服器處理，適合長影片</p>
            )}
          </div>
        </div>
      )}

      {/* Export button */}
      {!downloadUrl && (
        <Button
          className="w-full"
          onClick={handleExport}
          disabled={exporting || state.clips.length === 0}
        >
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {exportMode === 'server' ? '伺服器處理中...' : '匯出中...'}
            </>
          ) : (
            <>
              {exportMode === 'server' ? (
                <Server className="w-4 h-4 mr-2" />
              ) : (
                <Film className="w-4 h-4 mr-2" />
              )}
              開始匯出
            </>
          )}
        </Button>
      )}

      {/* Progress */}
      {exporting && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-center text-muted-foreground">
            {serverExportStatus || `${Math.round(progress)}%`}
          </p>
          {exportMode === 'server' && (
            <p className="text-[10px] text-center text-muted-foreground">
              伺服器處理可能需要 1-5 分鐘，請耐心等候
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <p className="text-xs text-destructive">{error}</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={handleExport}>
              重試
            </Button>
            {exportMode === 'server' && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setExportMode('browser');
                  setError(null);
                }}
              >
                改用瀏覽器匯出
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Download */}
      {downloadUrl && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            <p className="text-sm font-medium text-green-700">匯出完成！</p>
          </div>
          <Button className="w-full" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            下載影片
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              if (downloadUrl.startsWith('blob:')) {
                URL.revokeObjectURL(downloadUrl);
              }
              setDownloadUrl(null);
              setProgress(0);
              setError(null);
            }}
          >
            重新匯出
          </Button>
        </div>
      )}
    </div>
  );
}
