'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  QUICK_TEMPLATES,
  getTemplatesByOccasion,
  buildEditorTitleCard,
  buildEditorOutroCard,
  buildEditorTransitions,
} from '@/lib/templates';
import type { QuickTemplate } from '@/lib/templates';
import type { OccasionType } from '@/types';
import {
  ArrowLeft,
  GripVertical,
  Play,
  Trash2,
  Wand2,
  Film,
  Loader2,
  Check,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveVideoUrl } from '@/lib/video-url';
import { logger } from '@/lib/logger';

interface ClipData {
  jobId: string;
  videoIndex: number;
  videoUrl: string;
  name: string;
}

const OCCASION_LABELS: Record<OccasionType, string> = {
  memorial: '追思',
  birthday: '生日',
  wedding: '婚禮',
  pet: '寵物',
  other: '其他',
};

function ShowcaseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const clipsParam = searchParams.get('clips');

  const [clips, setClips] = useState<ClipData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [filterOccasion, setFilterOccasion] = useState<OccasionType | 'all'>('all');
  const [inputs, setInputs] = useState({ name: '', date: '', message: '' });
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  // Parse clip keys and fetch video URLs
  useEffect(() => {
    async function loadClips() {
      if (!clipsParam) {
        setLoading(false);
        return;
      }

      const clipKeys = clipsParam.split(',');
      const loadedClips: ClipData[] = [];

      for (const key of clipKeys) {
        const [jobId, videoIndexStr] = key.split(':');
        const videoIndex = parseInt(videoIndexStr, 10);

        try {
          const res = await fetch(`/api/gallery/${jobId}`);
          if (res.ok) {
            const job = await res.json();
            // API returns job directly, not wrapped in { job: ... }
            const videoUrls = job.videoUrls || [job.videoUrl];
            const videoUrl = videoUrls[videoIndex];
            if (videoUrl) {
              loadedClips.push({
                jobId,
                videoIndex,
                videoUrl,
                name: job.name || `影片 ${loadedClips.length + 1}`,
              });
            }
          }
        } catch (e) {
          logger.error(`Failed to load clip ${key}:`, e);
        }
      }

      setClips(loadedClips);
      setLoading(false);
    }

    loadClips();
  }, [clipsParam]);

  const moveClip = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= clips.length) return;

    const newClips = [...clips];
    [newClips[index], newClips[newIndex]] = [newClips[newIndex], newClips[index]];
    setClips(newClips);
  };

  const removeClip = (index: number) => {
    setClips(clips.filter((_, i) => i !== index));
  };

  const handleExport = async () => {
    if (!selectedTemplate || clips.length < 2) return;

    const template = QUICK_TEMPLATES.find(t => t.id === selectedTemplate);
    if (!template) return;

    setExporting(true);
    setExportProgress(0);
    setExportError(null);

    try {
      // Build export request
      const titleCard = buildEditorTitleCard(template, inputs);
      const outroCard = buildEditorOutroCard(template, inputs);
      const transitions = buildEditorTransitions(template, clips.length);

      const exportRequest = {
        jobId: `showcase-${Date.now()}`,
        clips: clips.map(clip => ({
          sourceUrl: resolveVideoUrl(clip.videoUrl, 'export', window.location.origin),
          trimStart: 0,
          trimEnd: 5, // Default 5s per clip
          speed: 1.0,
          volume: 1.0,
          filter: null,
        })),
        transitions: transitions.map(t => ({
          type: t.type,
          durationMs: t.durationMs,
        })),
        subtitles: [],
        musicClips: [],
        titleCard: {
          text: titleCard.text,
          subtitle: titleCard.subtitle,
          durationSeconds: titleCard.durationSeconds,
          backgroundColor: titleCard.backgroundColor,
          textColor: titleCard.textColor,
        },
        outroCard: {
          text: outroCard.text,
          subtitle: outroCard.subtitle,
          durationSeconds: outroCard.durationSeconds,
          backgroundColor: outroCard.backgroundColor,
          textColor: outroCard.textColor,
        },
      };

      setExportProgress(10);

      // Start async export
      const startResponse = await fetch('/api/export-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportRequest),
      });

      const startResult = await startResponse.json();

      if (!startResponse.ok || !startResult.success) {
        throw new Error(startResult.error || '匯出失敗');
      }

      const { exportId } = startResult;
      setExportProgress(20);

      // Poll for completion
      let pollCount = 0;
      const maxPolls = 120;
      const pollInterval = 5000;

      while (pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;

        const simulatedProgress = Math.min(90, 20 + (pollCount / maxPolls) * 70);
        setExportProgress(simulatedProgress);

        const statusResponse = await fetch(`/api/export-status?exportId=${exportId}`);
        const statusResult = await statusResponse.json();

        if (statusResult.status === 'complete') {
          setExportProgress(100);
          if (statusResult.downloadUrl) {
            // Open download URL
            window.open(statusResult.downloadUrl, '_blank');
          }
          return;
        }

        if (statusResult.status === 'error') {
          throw new Error(statusResult.error || '匯出失敗');
        }
      }

      throw new Error('匯出逾時');
    } catch (err) {
      logger.error('Export failed:', err);
      setExportError(err instanceof Error ? err.message : '匯出失敗');
    } finally {
      setExporting(false);
    }
  };

  const filteredTemplates = filterOccasion === 'all'
    ? QUICK_TEMPLATES
    : getTemplatesByOccasion(filterOccasion);

  const template = selectedTemplate
    ? QUICK_TEMPLATES.find(t => t.id === selectedTemplate)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center">
          <Film className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">未選取影片</h2>
          <p className="text-muted-foreground mb-4">
            請先從影片庫選取影片
          </p>
          <Button asChild>
            <Link href="/gallery">返回影片庫</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-8">
      {/* Left: Clip arrangement */}
      <div>
        <h2 className="text-lg font-semibold mb-4">排列影片 ({clips.length} 支)</h2>
        <div className="space-y-2">
          {clips.map((clip, index) => (
            <div
              key={`${clip.jobId}-${clip.videoIndex}`}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
              <div className="w-16 h-9 bg-black rounded overflow-hidden flex-shrink-0">
                <video
                  src={clip.videoUrl}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{clip.name}</p>
                <p className="text-xs text-muted-foreground">影片 {clip.videoIndex + 1}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => moveClip(index, 'up')}
                  disabled={index === 0}
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => moveClip(index, 'down')}
                  disabled={index === clips.length - 1}
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:text-destructive"
                  onClick={() => removeClip(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Template selection */}
      <div>
        <h2 className="text-lg font-semibold mb-4">選擇範本</h2>

        {/* Occasion filter */}
        <div className="flex flex-wrap gap-1 mb-4">
          <button
            onClick={() => setFilterOccasion('all')}
            className={cn(
              'px-2 py-1 text-xs rounded-md transition-colors',
              filterOccasion === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            )}
          >
            全部
          </button>
          {(Object.keys(OCCASION_LABELS) as OccasionType[]).map((occasion) => (
            <button
              key={occasion}
              onClick={() => setFilterOccasion(occasion)}
              className={cn(
                'px-2 py-1 text-xs rounded-md transition-colors',
                filterOccasion === occasion
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              )}
            >
              {OCCASION_LABELS[occasion]}
            </button>
          ))}
        </div>

        {/* Template list */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {filteredTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t.id)}
              className={cn(
                'w-full p-3 rounded-lg border text-left transition-all',
                selectedTemplate === t.id
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-border hover:border-muted-foreground/50'
              )}
            >
              <div
                className="w-full h-1 rounded-t mb-2"
                style={{ backgroundColor: t.previewColor }}
              />
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{t.name}</span>
                {selectedTemplate === t.id && <Check className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </button>
          ))}
        </div>

        {/* Template inputs */}
        {template && (
          <div className="mt-4 space-y-3 p-4 bg-muted/50 rounded-lg">
            <div>
              <label className="text-xs text-muted-foreground">名稱</label>
              <input
                type="text"
                value={inputs.name}
                onChange={(e) => setInputs({ ...inputs, name: e.target.value })}
                placeholder="例如: 王小明"
                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">日期 (選填)</label>
              <input
                type="text"
                value={inputs.date}
                onChange={(e) => setInputs({ ...inputs, date: e.target.value })}
                placeholder="例如: 1950-2024"
                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">訊息 (選填)</label>
              <input
                type="text"
                value={inputs.message}
                onChange={(e) => setInputs({ ...inputs, message: e.target.value })}
                placeholder="例如: 永遠懷念您"
                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background"
              />
            </div>
          </div>
        )}

        {/* Export button */}
        <div className="mt-6">
          {exportError && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {exportError}
            </div>
          )}

          {exporting ? (
            <div className="space-y-2">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <p className="text-sm text-center text-muted-foreground">
                匯出中... {Math.round(exportProgress)}%
              </p>
            </div>
          ) : (
            <Button
              className="w-full"
              size="lg"
              onClick={handleExport}
              disabled={!selectedTemplate || !inputs.name || clips.length < 2}
            >
              <Wand2 className="w-5 h-5 mr-2" />
              製作展示影片
            </Button>
          )}

          {!selectedTemplate && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              請選擇一個範本
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ShowcasePage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/gallery">
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回影片庫
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-4">製作展示影片</h1>
            <p className="text-muted-foreground">
              排列影片、選擇範本、一鍵匯出
            </p>
          </div>

          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          }>
            <ShowcaseContent />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
