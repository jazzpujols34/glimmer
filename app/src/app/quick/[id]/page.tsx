'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Download,
  ArrowLeft,
  Sparkles,
  Film,
  Music,
  AlertCircle,
  Play,
} from 'lucide-react';

interface SegmentStatus {
  index: number;
  jobId: string;
  status: string;
  progress?: number;
  videoUrl?: string;
}

interface QuickStatusResponse {
  quickId: string;
  status: 'generating' | 'exporting' | 'complete' | 'error';
  name: string;
  templateId: string;
  batchId: string;
  totalSegments: number;
  completedSegments: number;
  failedSegments: number;
  generationProgress: number;
  segments: SegmentStatus[];
  exportStatus?: string;
  exportProgress?: number;
  videoUrl?: string;
  error?: string;
  createdAt: string;
}

export default function QuickProgressPage() {
  const params = useParams();
  const quickId = params.id as string;
  const t = useTranslation();

  const [status, setStatus] = useState<QuickStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/quick-status/${quickId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch status');
      }
      const data: QuickStatusResponse = await res.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [quickId]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll while not complete
  useEffect(() => {
    if (!status) return;
    if (status.status === 'complete' || status.status === 'error') return;

    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [status, fetchStatus]);

  // Calculate overall progress
  const getOverallProgress = () => {
    if (!status) return 0;

    if (status.status === 'complete') return 100;
    if (status.status === 'error') return status.generationProgress;

    if (status.status === 'generating') {
      // Generation is 0-70% of overall
      return Math.round(status.generationProgress * 0.7);
    }

    if (status.status === 'exporting') {
      // Export is 70-100%
      const exportPct = status.exportProgress || 0;
      return 70 + Math.round(exportPct * 0.3);
    }

    return 0;
  };

  const getStatusIcon = (segmentStatus: string) => {
    switch (segmentStatus) {
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
    }
  };

  const getPhaseInfo = () => {
    if (!status) return { icon: Loader2, text: '載入中...', animate: true };

    switch (status.status) {
      case 'generating':
        return {
          icon: Film,
          text: `生成中 (${status.completedSegments}/${status.totalSegments})`,
          animate: true,
        };
      case 'exporting':
        return {
          icon: Music,
          text: '合成影片中...',
          animate: true,
        };
      case 'complete':
        return {
          icon: CheckCircle,
          text: '完成！',
          animate: false,
        };
      case 'error':
        return {
          icon: XCircle,
          text: '發生錯誤',
          animate: false,
        };
      default:
        return { icon: Loader2, text: '處理中...', animate: true };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Logo />
            <LanguageToggle />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary mb-4" />
            <p className="text-muted-foreground">{t('common.loading')}</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Logo />
            <LanguageToggle />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
              <h2 className="text-xl font-semibold mb-2">{t('generate.error')}</h2>
              <p className="text-muted-foreground mb-6">{error || '找不到任務'}</p>
              <Button asChild>
                <Link href="/quick">{t('generate.retry')}</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const phase = getPhaseInfo();
  const PhaseIcon = phase.icon;
  const overallProgress = getOverallProgress();
  const isComplete = status.status === 'complete';
  const hasError = status.status === 'error';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <LanguageToggle />
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Back link */}
          <Link
            href="/quick"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </Link>

          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              {status.name}
            </h1>
            <p className="text-muted-foreground">快速生成</p>
          </div>

          {/* Main progress card */}
          <Card className="mb-6">
            <CardContent className="p-8">
              {/* Phase indicator */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <PhaseIcon
                  className={cn(
                    'w-8 h-8',
                    isComplete ? 'text-green-500' :
                    hasError ? 'text-destructive' :
                    'text-primary',
                    phase.animate && 'animate-pulse'
                  )}
                />
                <span className="text-xl font-medium">{phase.text}</span>
              </div>

              {/* Progress bar */}
              <div className="h-4 bg-muted rounded-full overflow-hidden mb-4">
                <div
                  className={cn(
                    'h-full transition-all duration-500',
                    isComplete ? 'bg-green-500' :
                    hasError ? 'bg-destructive' :
                    'bg-primary'
                  )}
                  style={{ width: `${overallProgress}%` }}
                />
              </div>

              <p className="text-center text-muted-foreground">
                {overallProgress}%
              </p>

              {/* Error message */}
              {hasError && status.error && (
                <div className="mt-4 p-4 rounded-lg bg-destructive/10 text-destructive text-sm text-center">
                  {status.error}
                </div>
              )}

              {/* Complete: Video preview + download */}
              {isComplete && status.videoUrl && (
                <div className="mt-6 space-y-4">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden">
                    <video
                      src={status.videoUrl}
                      controls
                      className="w-full h-full"
                      preload="metadata"
                    />
                  </div>
                  <Button asChild className="w-full" size="lg">
                    <a href={status.videoUrl} download={`${status.name}.mp4`}>
                      <Download className="w-5 h-5 mr-2" />
                      下載影片
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Segment progress (during generation) */}
          {status.status === 'generating' && status.segments.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-medium mb-4">片段進度</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {status.segments.map((segment) => (
                    <div
                      key={segment.jobId}
                      className={cn(
                        'aspect-square rounded-lg flex flex-col items-center justify-center text-center p-2',
                        segment.status === 'complete' ? 'bg-green-500/10' :
                        segment.status === 'error' ? 'bg-destructive/10' :
                        'bg-muted'
                      )}
                    >
                      {getStatusIcon(segment.status)}
                      <span className="text-xs mt-1">
                        {segment.index + 1}
                      </span>
                      {segment.status !== 'complete' && segment.status !== 'error' && (
                        <span className="text-xs text-muted-foreground">
                          {segment.progress || 0}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions after complete */}
          {isComplete && (
            <div className="flex flex-wrap gap-4 justify-center mt-6">
              <Button variant="outline" asChild>
                <Link href="/quick">
                  <Sparkles className="w-4 h-4 mr-2" />
                  再製作一個
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/gallery">
                  <Play className="w-4 h-4 mr-2" />
                  瀏覽作品集
                </Link>
              </Button>
            </div>
          )}

          {/* Retry after error */}
          {hasError && (
            <div className="flex justify-center mt-6">
              <Button asChild>
                <Link href="/quick">{t('generate.retry')}</Link>
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>{t('footer.copyright')}</p>
        </div>
      </footer>
    </div>
  );
}
