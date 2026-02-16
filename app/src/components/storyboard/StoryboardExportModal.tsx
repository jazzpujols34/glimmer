'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, Loader2, CheckCircle, X, AlertTriangle } from 'lucide-react';
import type { Storyboard } from '@/types';

interface StoryboardExportModalProps {
  storyboard: Storyboard;
  onClose: () => void;
}

export function StoryboardExportModal({ storyboard, onClose }: StoryboardExportModalProps) {
  const [status, setStatus] = useState<'starting' | 'processing' | 'complete' | 'error'>('starting');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('準備匯出...');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filledSlots = storyboard.slots.filter(s => s.status === 'filled' && s.clip);
  const totalDuration = filledSlots.reduce((sum, slot) => sum + (slot.clip?.duration || 0), 0);

  useEffect(() => {
    startExport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startExport = async () => {
    try {
      setStatus('starting');
      setProgress(5);
      setStatusText('正在準備匯出...');

      // Start export
      const response = await fetch(`/api/storyboards/${storyboard.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '匯出失敗');
      }

      const { exportId } = result;
      setStatus('processing');
      setProgress(15);
      setStatusText('伺服器處理中...');

      // Poll for completion
      let pollCount = 0;
      const maxPolls = 120; // 10 minutes with 5s interval
      const pollInterval = 5000;

      while (pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;

        // Simulate progress (15% to 90% over polling period)
        const simulatedProgress = Math.min(90, 15 + (pollCount / maxPolls) * 75);
        setProgress(simulatedProgress);
        setStatusText(`伺服器處理中... (${Math.round(simulatedProgress)}%)`);

        const statusResponse = await fetch(`/api/export-status?exportId=${exportId}`);
        const statusResult = await statusResponse.json();

        if (statusResult.status === 'complete') {
          setProgress(100);
          setStatus('complete');
          setStatusText('匯出完成！');

          if (statusResult.downloadUrl) {
            setDownloadUrl(statusResult.downloadUrl);
          } else {
            throw new Error('未收到下載連結');
          }
          return;
        }

        if (statusResult.status === 'error') {
          throw new Error(statusResult.error || '匯出失敗');
        }
      }

      // Timeout
      throw new Error('匯出逾時，請重試');

    } catch (err) {
      console.error('Storyboard export failed:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : '匯出失敗');
    }
  };

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
  };

  const handleRetry = () => {
    setError(null);
    setDownloadUrl(null);
    setProgress(0);
    startExport();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={status === 'complete' || status === 'error' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        {/* Close button */}
        {(status === 'complete' || status === 'error') && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Title */}
        <h2 className="text-lg font-semibold mb-4">匯出故事板</h2>

        {/* Summary */}
        <div className="space-y-2 text-sm text-muted-foreground mb-6">
          <div className="flex justify-between">
            <span>片段數量</span>
            <span className="font-medium text-foreground">{filledSlots.length} / {storyboard.slotCount}</span>
          </div>
          <div className="flex justify-between">
            <span>總時長</span>
            <span className="font-medium text-foreground">{totalDuration.toFixed(1)} 秒</span>
          </div>
          <div className="flex justify-between">
            <span>解析度</span>
            <span className="font-medium text-foreground">
              {storyboard.aspectRatio === '16:9' ? '1280 × 720' : '720 × 1280'}
            </span>
          </div>
        </div>

        {/* Progress */}
        {(status === 'starting' || status === 'processing') && (
          <div className="space-y-3">
            <Progress value={progress} className="h-2" />
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{statusText}</span>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              處理可能需要 1-5 分鐘，請耐心等候
            </p>
          </div>
        )}

        {/* Success */}
        {status === 'complete' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-700">匯出完成！</p>
                <p className="text-sm text-green-600">影片已準備好下載</p>
              </div>
            </div>

            <Button className="w-full" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              下載影片
            </Button>

            <Button variant="outline" className="w-full" onClick={onClose}>
              關閉
            </Button>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0" />
              <div>
                <p className="font-medium text-destructive">匯出失敗</p>
                <p className="text-sm text-destructive/80">{error}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleRetry}>
                重試
              </Button>
              <Button variant="outline" className="flex-1" onClick={onClose}>
                取消
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
