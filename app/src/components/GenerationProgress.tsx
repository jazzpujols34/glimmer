'use client';

import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import type { GenerationStatus } from '@/types';

interface GenerationProgressProps {
  jobId: string;
  onComplete: (videoUrl: string, videoUrls: string[], analysis?: string) => void;
  onError: (error: string) => void;
}

const statusMessages: Record<GenerationStatus, string> = {
  queued: '準備中...',
  processing: '正在生成影片...',
  complete: '影片已完成！',
  error: '發生錯誤',
};

const statusDescriptions: Record<GenerationStatus, string> = {
  queued: '您的請求已加入排隊，即將開始處理',
  processing: 'AI 正在將您的照片轉化為動人影片',
  complete: '您的回憶影片已經準備好了',
  error: '處理過程中發生問題，請稍後再試',
};

// Max polling: ~15 minutes (450 attempts * 2s)
const MAX_POLL_ATTEMPTS = 450;
const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_ERRORS = 5;

export function GenerationProgress({ jobId, onComplete, onError }: GenerationProgressProps) {
  const [status, setStatus] = useState<GenerationStatus>('queued');
  const [progress, setProgress] = useState(0);
  const [networkError, setNetworkError] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line prefer-const -- assigned after pollStatus is defined for closure
    let intervalId: NodeJS.Timeout;
    let attempts = 0;
    let consecutiveErrors = 0;

    const pollStatus = async () => {
      attempts++;

      // Timeout protection: stop after ~15 minutes
      if (attempts > MAX_POLL_ATTEMPTS) {
        clearInterval(intervalId);
        onError('生成時間過長，請稍後在影片庫查看結果 (Generation timed out)');
        return;
      }

      try {
        const res = await fetch(`/api/status/${jobId}`);

        if (!res.ok) {
          // HTTP error but server is reachable
          const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          if (res.status === 429) {
            // Rate limited — slow down but don't error out
            return;
          }
          clearInterval(intervalId);
          onError(data.error || '發生錯誤');
          return;
        }

        const data = await res.json();
        consecutiveErrors = 0;
        setNetworkError(false);

        setStatus(data.status);
        setProgress(data.progress || 0);

        if (data.status === 'complete' && data.videoUrl) {
          clearInterval(intervalId);
          const videoUrls = data.videoUrls || [data.videoUrl];
          onComplete(data.videoUrl, videoUrls, data.analysis);
        } else if (data.status === 'error') {
          clearInterval(intervalId);
          onError(data.error || '發生錯誤');
        }
      } catch (err) {
        console.error('Polling error:', err);
        consecutiveErrors++;
        setNetworkError(true);

        // If server is unreachable for too long, stop polling
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          clearInterval(intervalId);
          onError('網路連線失敗，請檢查網路後重新整理頁面 (Network error)');
        }
      }
    };

    // Poll immediately, then every 2 seconds
    pollStatus();
    intervalId = setInterval(pollStatus, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [jobId, onComplete, onError]);

  return (
    <div className="space-y-6 text-center">
      {/* Animated icon */}
      <div className="flex justify-center">
        {status === 'complete' ? (
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : status === 'error' ? (
          <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        ) : (
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
            <svg className="w-10 h-10 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}
      </div>

      {/* Status text */}
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">{statusMessages[status]}</h2>
        <p className="text-muted-foreground">{statusDescriptions[status]}</p>
      </div>

      {/* Progress bar */}
      {(status === 'queued' || status === 'processing') && (
        <div className="space-y-2 max-w-md mx-auto">
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground">{progress}% 完成</p>
        </div>
      )}

      {/* Network warning */}
      {networkError && (status === 'queued' || status === 'processing') && (
        <p className="text-sm text-amber-500">
          網路連線不穩，正在重試... (Reconnecting...)
        </p>
      )}

      {/* Processing stages */}
      {(status === 'queued' || status === 'processing') && (
        <div className="flex justify-center gap-8 text-sm">
          <div className={`flex items-center gap-2 ${progress >= 10 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-2 h-2 rounded-full ${progress >= 10 ? 'bg-primary' : 'bg-muted'}`} />
            處理照片
          </div>
          <div className={`flex items-center gap-2 ${progress >= 50 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-2 h-2 rounded-full ${progress >= 50 ? 'bg-primary' : 'bg-muted'}`} />
            生成影片
          </div>
          <div className={`flex items-center gap-2 ${progress >= 95 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-2 h-2 rounded-full ${progress >= 95 ? 'bg-primary' : 'bg-muted'}`} />
            最後處理
          </div>
        </div>
      )}
    </div>
  );
}
