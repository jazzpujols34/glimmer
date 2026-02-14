'use client';

import { useState, useEffect } from 'react';
import { useEditor, useEditorDispatch } from './EditorContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { exportVideo } from '@/lib/editor/ffmpeg-export';
import { Download, Loader2, Film, CheckCircle } from 'lucide-react';
import { trackVideoExport } from '@/lib/analytics';

export function ExportPanel() {
  const state = useEditor();
  const dispatch = useEditorDispatch();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Revoke blob URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const handleExport = async () => {
    setExporting(true);
    setProgress(0);
    setError(null);
    // Revoke previous blob URL before creating a new one
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
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

      // Track video export
      trackVideoExport('editor', state.totalDuration);
    } catch (err) {
      console.error('Export failed:', err);
      setError(err instanceof Error ? err.message : '匯出失敗');
      dispatch({ type: 'SET_EXPORT_PROGRESS', payload: null });
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${state.jobName || 'glimmer'}-edited.mp4`;
    a.click();
  };

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
        <div className="flex justify-between">
          <span>片頭卡</span>
          <span className="font-medium text-foreground">{state.titleCard ? '是' : '無'}</span>
        </div>
        <div className="flex justify-between">
          <span>片尾卡</span>
          <span className="font-medium text-foreground">{state.outroCard ? '是' : '無'}</span>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Export info */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>匯出格式: MP4 (H.264 + AAC)</p>
        <p>解析度: 1280 x 720</p>
        <p>匯出在瀏覽器中進行，不會上傳至伺服器</p>
      </div>

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
              匯出中...
            </>
          ) : (
            <>
              <Film className="w-4 h-4 mr-2" />
              開始匯出
            </>
          )}
        </Button>
      )}

      {/* Progress */}
      {exporting && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-center text-muted-foreground">{Math.round(progress)}%</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <p className="text-xs text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={handleExport}>
            重試
          </Button>
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
              if (downloadUrl) URL.revokeObjectURL(downloadUrl);
              setDownloadUrl(null);
              setProgress(0);
            }}
          >
            重新匯出
          </Button>
        </div>
      )}
    </div>
  );
}
