'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Progress } from '@/components/ui/progress';
import type { GenerationStatus } from '@/types';
import { logger } from '@/lib/logger';

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

// Exponential backoff configuration
const INITIAL_INTERVAL_MS = 5000;    // Start at 5s
const MAX_INTERVAL_MS = 30000;       // Cap at 30s
const BACKOFF_FACTOR = 1.3;          // Increase by 30% each time
const RATE_LIMIT_BACKOFF = 2;        // Double on rate limit
const MAX_POLL_ATTEMPTS = 200;       // ~15 minutes with backoff
const MAX_CONSECUTIVE_ERRORS = 5;
const PROGRESS_STALL_THRESHOLD = 3;  // Polls without progress before backoff

export function GenerationProgress({ jobId, onComplete, onError }: GenerationProgressProps) {
  const [status, setStatus] = useState<GenerationStatus>('queued');
  const [progress, setProgress] = useState(0);
  const [networkError, setNetworkError] = useState(false);

  // Refs for polling state (avoid stale closures)
  const intervalRef = useRef<number>(INITIAL_INTERVAL_MS);
  const attemptsRef = useRef(0);
  const consecutiveErrorsRef = useRef(0);
  const lastProgressRef = useRef(0);
  const stallCountRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Reset state for new job
    intervalRef.current = INITIAL_INTERVAL_MS;
    attemptsRef.current = 0;
    consecutiveErrorsRef.current = 0;
    lastProgressRef.current = 0;
    stallCountRef.current = 0;

    const scheduleNextPoll = (delay: number) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(pollStatus, delay);
    };

    const pollStatus = async () => {
      if (!mountedRef.current) return;

      attemptsRef.current++;
      const attempts = attemptsRef.current;

      // Timeout protection
      if (attempts > MAX_POLL_ATTEMPTS) {
        onError('生成時間過長，請稍後在影片庫查看結果 (Generation timed out)');
        return;
      }

      try {
        const res = await fetch(`/api/status/${jobId}`);

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

          if (res.status === 429) {
            // Rate limited — back off aggressively
            intervalRef.current = Math.min(intervalRef.current * RATE_LIMIT_BACKOFF, MAX_INTERVAL_MS);
            logger.debug('Polling', `Rate limited, backing off to ${intervalRef.current}ms`);
            scheduleNextPoll(intervalRef.current);
            return;
          }

          onError(data.error || '發生錯誤');
          return;
        }

        const data = await res.json();
        consecutiveErrorsRef.current = 0;
        if (mountedRef.current) setNetworkError(false);

        const newProgress = data.progress || 0;

        // Check if progress has stalled
        if (newProgress === lastProgressRef.current) {
          stallCountRef.current++;
          if (stallCountRef.current >= PROGRESS_STALL_THRESHOLD) {
            // Progress stalled — increase interval
            intervalRef.current = Math.min(intervalRef.current * BACKOFF_FACTOR, MAX_INTERVAL_MS);
            logger.debug('Polling', `Progress stalled, backing off to ${intervalRef.current}ms`);
          }
        } else {
          // Progress detected — reset to faster polling
          stallCountRef.current = 0;
          intervalRef.current = INITIAL_INTERVAL_MS;
          lastProgressRef.current = newProgress;
        }

        if (mountedRef.current) {
          setStatus(data.status);
          setProgress(newProgress);
        }

        if (data.status === 'complete' && data.videoUrl) {
          const videoUrls = data.videoUrls || [data.videoUrl];
          onComplete(data.videoUrl, videoUrls, data.analysis);
          return; // Stop polling
        } else if (data.status === 'error') {
          onError(data.error || '發生錯誤');
          return; // Stop polling
        }

        // Schedule next poll with current interval
        scheduleNextPoll(intervalRef.current);
      } catch (err) {
        logger.error('Polling error:', err);
        consecutiveErrorsRef.current++;
        if (mountedRef.current) setNetworkError(true);

        // Back off on network errors
        intervalRef.current = Math.min(intervalRef.current * BACKOFF_FACTOR, MAX_INTERVAL_MS);

        if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
          onError('網路連線失敗，請檢查網路後重新整理頁面 (Network error)');
          return;
        }

        // Retry with backoff
        scheduleNextPoll(intervalRef.current);
      }
    };

    // Start polling immediately
    pollStatus();

    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
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

      {/* Processing stages - visual timeline */}
      {(status === 'queued' || status === 'processing') && (
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between relative">
            {/* Progress line background */}
            <div className="absolute top-4 left-8 right-8 h-0.5 bg-muted" />
            {/* Progress line filled */}
            <div
              className="absolute top-4 left-8 h-0.5 bg-primary transition-all duration-500"
              style={{ width: `calc(${Math.min(progress, 100)}% - 64px)` }}
            />

            {/* Stage 1: Upload/Queue */}
            <div className="flex flex-col items-center gap-2 z-10">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                progress >= 5 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {progress >= 5 ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                )}
              </div>
              <span className={`text-xs ${progress >= 5 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                上傳照片
              </span>
            </div>

            {/* Stage 2: AI Analysis */}
            <div className="flex flex-col items-center gap-2 z-10">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                progress >= 30 ? 'bg-primary text-primary-foreground' : progress >= 5 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {progress >= 30 ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : progress >= 5 ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                )}
              </div>
              <span className={`text-xs ${progress >= 5 && progress < 30 ? 'text-primary font-medium' : progress >= 30 ? 'text-primary' : 'text-muted-foreground'}`}>
                AI 分析
              </span>
            </div>

            {/* Stage 3: Video Generation */}
            <div className="flex flex-col items-center gap-2 z-10">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                progress >= 90 ? 'bg-primary text-primary-foreground' : progress >= 30 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {progress >= 90 ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : progress >= 30 ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </div>
              <span className={`text-xs ${progress >= 30 && progress < 90 ? 'text-primary font-medium' : progress >= 90 ? 'text-primary' : 'text-muted-foreground'}`}>
                生成影片
              </span>
            </div>

            {/* Stage 4: Final Processing */}
            <div className="flex flex-col items-center gap-2 z-10">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                progress >= 100 ? 'bg-primary text-primary-foreground' : progress >= 90 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {progress >= 100 ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : progress >= 90 ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
              </div>
              <span className={`text-xs ${progress >= 90 && progress < 100 ? 'text-primary font-medium' : progress >= 100 ? 'text-primary' : 'text-muted-foreground'}`}>
                完成處理
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
