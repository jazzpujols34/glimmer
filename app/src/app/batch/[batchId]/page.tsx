'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useTranslation } from '@/lib/i18n';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Download,
  FolderOpen,
  ArrowLeft,
  Play,
  AlertCircle,
  Sparkles,
  Music,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SegmentStatus {
  jobId: string;
  segmentIndex: number;
  status: string;
  progress?: number;
  videoUrl?: string;
  error?: string;
}

interface BatchStatusResponse {
  batchId: string;
  status: string;
  projectId: string;
  name: string;
  totalSegments: number;
  completedSegments: number;
  failedSegments: number;
  progress: number;
  segments: SegmentStatus[];
  createdAt: string;
}

interface QuickStatusResponse {
  quickId: string;
  status: 'generating' | 'exporting' | 'complete' | 'error';
  exportStatus?: string;
  exportProgress?: number;
  videoUrl?: string;
  error?: string;
}

export default function BatchPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const batchId = params.batchId as string;
  const quickId = searchParams.get('quick');
  const t = useTranslation();

  const [batch, setBatch] = useState<BatchStatusResponse | null>(null);
  const [quick, setQuick] = useState<QuickStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<SegmentStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      // Fetch batch status
      const res = await fetch(`/api/batch-status/${batchId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch batch status');
      }
      const data: BatchStatusResponse = await res.json();
      setBatch(data);

      // If this is a quick job, also fetch quick status for export progress
      if (quickId) {
        const quickRes = await fetch(`/api/quick-status/${quickId}`);
        if (quickRes.ok) {
          const quickData: QuickStatusResponse = await quickRes.json();
          setQuick(quickData);
        }
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [batchId, quickId]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll while processing
  useEffect(() => {
    if (!batch) return;

    // For quick jobs, continue polling until export is done
    if (quickId && quick) {
      if (quick.status === 'complete' || quick.status === 'error') return;
    } else {
      // Regular batch - stop when batch is done
      if (batch.status === 'complete' || batch.status === 'error') return;
    }

    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [batch, quick, quickId, fetchStatus]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'complete':
        return t('generate.complete');
      case 'error':
        return t('generate.error');
      case 'partial':
        return '部分完成';
      default:
        return t('common.loading');
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

  if (error || !batch) {
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
              <p className="text-muted-foreground mb-6">{error || '找不到批次'}</p>
              <Button asChild>
                <Link href="/create">{t('generate.retry')}</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const isComplete = batch.status === 'complete';
  const isPartial = batch.status === 'partial';
  const hasError = batch.status === 'error';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${batch.projectId}`}>
                <FolderOpen className="w-4 h-4 mr-2" />
                查看專案
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Back link */}
          <Link
            href="/create"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            返回製作
          </Link>

          {/* Title */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-2">{batch.name}</h1>
            <p className="text-muted-foreground">
              批次生成 · {batch.totalSegments} 段影片
            </p>
          </div>

          {/* Overall progress */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(batch.status)}
                  <span className="font-medium">{getStatusText(batch.status)}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {batch.completedSegments} / {batch.totalSegments} 完成
                  {batch.failedSegments > 0 && (
                    <span className="text-destructive ml-2">
                      ({batch.failedSegments} 失敗)
                    </span>
                  )}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    isComplete ? "bg-green-500" :
                    hasError ? "bg-destructive" :
                    isPartial ? "bg-amber-500" :
                    "bg-primary"
                  )}
                  style={{ width: `${batch.progress}%` }}
                />
              </div>

              {/* Progress text */}
              <p className="text-sm text-muted-foreground mt-2 text-center">
                {batch.progress}%
              </p>
            </CardContent>
          </Card>

          {/* Quick Job Export Progress */}
          {quickId && quick && (
            <Card className="mb-8">
              <CardContent className="p-6">
                {/* Export phase indicator */}
                <div className="flex items-center justify-center gap-3 mb-4">
                  {quick.status === 'complete' ? (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  ) : quick.status === 'error' ? (
                    <XCircle className="w-6 h-6 text-destructive" />
                  ) : quick.status === 'exporting' ? (
                    <Music className="w-6 h-6 text-primary animate-pulse" />
                  ) : (
                    <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                  )}
                  <span className="font-medium">
                    {quick.status === 'generating' && '生成片段中...'}
                    {quick.status === 'exporting' && '合成影片中...'}
                    {quick.status === 'complete' && '影片完成！'}
                    {quick.status === 'error' && '發生錯誤'}
                  </span>
                </div>

                {/* Export progress bar */}
                {quick.status === 'exporting' && (
                  <>
                    <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${quick.exportProgress || 0}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      匯出進度 {quick.exportProgress || 0}%
                    </p>
                  </>
                )}

                {/* Error message */}
                {quick.status === 'error' && quick.error && (
                  <p className="text-sm text-destructive text-center">
                    {quick.error}
                  </p>
                )}

                {/* Final video preview and download */}
                {quick.status === 'complete' && quick.videoUrl && (
                  <div className="mt-4 space-y-4">
                    <div className="aspect-video bg-black rounded-lg overflow-hidden">
                      <video
                        src={quick.videoUrl}
                        controls
                        className="w-full h-full"
                        preload="metadata"
                      />
                    </div>
                    <Button asChild className="w-full" size="lg">
                      <a href={quick.videoUrl} download={`${batch.name}.mp4`}>
                        <Download className="w-5 h-5 mr-2" />
                        下載完整影片
                      </a>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Segment grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-8">
            {batch.segments.map((segment, index) => (
              <Card
                key={segment.jobId}
                className={cn(
                  "overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary/50",
                  selectedSegment?.jobId === segment.jobId && "ring-2 ring-primary"
                )}
                onClick={() => setSelectedSegment(segment)}
              >
                <div className="aspect-video bg-muted relative">
                  {segment.status === 'complete' && segment.videoUrl ? (
                    <>
                      <video
                        src={segment.videoUrl}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                          <Play className="w-5 h-5 text-white ml-0.5" />
                        </div>
                      </div>
                    </>
                  ) : segment.status === 'error' ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <XCircle className="w-8 h-8 text-destructive" />
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                      <span className="text-xs text-muted-foreground">
                        {segment.progress || 0}%
                      </span>
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">段落 {index + 1}</span>
                    {getStatusIcon(segment.status)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Actions */}
          {(isComplete || isPartial) && (
            <div className="flex flex-wrap gap-4 justify-center">
              <Button asChild>
                <Link href={`/projects/${batch.projectId}`}>
                  <FolderOpen className="w-4 h-4 mr-2" />
                  查看專案
                </Link>
              </Button>
              {batch.segments.filter(s => s.status === 'complete' && s.videoUrl).length > 0 && (
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  下載全部
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/create">
                  {t('generate.createAnother')}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Video preview modal */}
      {selectedSegment && selectedSegment.status === 'complete' && selectedSegment.videoUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedSegment(null)}
        >
          <div
            className="bg-background rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold">段落 {selectedSegment.segmentIndex + 1}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedSegment(null)}>
                關閉
              </Button>
            </div>
            <div className="aspect-video bg-black">
              <video
                src={selectedSegment.videoUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
            <div className="p-4 flex gap-2">
              <Button asChild className="flex-1">
                <a href={selectedSegment.videoUrl} download={`segment-${selectedSegment.segmentIndex + 1}.mp4`}>
                  <Download className="w-4 h-4 mr-2" />
                  {t('generate.download')}
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>{t('footer.copyright')}</p>
        </div>
      </footer>
    </div>
  );
}
