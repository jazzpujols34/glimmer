'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft,
  Plus,
  Star,
  Trash2,
  Download,
  Play,
  AlertCircle,
  X,
  Scissors,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Project, GenerationJob } from '@/types';

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<GenerationJob | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [videoErrors, setVideoErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadProject();
  }, [id]);

  async function loadProject() {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('找不到該專案');
        throw new Error('載入失敗');
      }
      const data = await res.json();
      setProject(data.project);
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleFavorite(jobId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      const res = await fetch(`/api/gallery/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('更新失敗');
      const data = await res.json();
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, favorite: data.favorite } : j))
      );
      if (selectedJob?.id === jobId) {
        setSelectedJob((prev) => (prev ? { ...prev, favorite: data.favorite } : null));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '更新失敗');
    }
  }

  async function handleCleanup() {
    const nonFavorites = jobs.filter((j) => !j.favorite);
    if (nonFavorites.length === 0) {
      alert('沒有需要刪除的影片（所有影片都已收藏）');
      return;
    }

    if (!confirm(`確定要刪除 ${nonFavorites.length} 支非收藏影片嗎？此操作無法復原。`)) {
      return;
    }

    setCleaning(true);
    try {
      const res = await fetch(`/api/projects/${id}/cleanup`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      const data = await res.json();
      alert(data.message);
      // Reload to get updated job list
      loadProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setCleaning(false);
    }
  }

  async function handleDeleteJob(jobId: string) {
    if (!confirm('確定要刪除這支影片嗎？')) return;

    setDeleting(jobId);
    try {
      const res = await fetch(`/api/gallery/${jobId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (selectedJob?.id === jobId) setSelectedJob(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setDeleting(null);
    }
  }

  const favoriteCount = jobs.filter((j) => j.favorite).length;
  const nonFavoriteCount = jobs.length - favoriteCount;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <p className="text-destructive mb-4">{error || '找不到該專案'}</p>
            <Button asChild>
              <Link href="/projects">返回專案列表</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <Button variant="outline" asChild>
            <Link href="/projects">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回專案列表
            </Link>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Project header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
            {project.description && (
              <p className="text-muted-foreground mb-4">{project.description}</p>
            )}
            <div className="flex flex-wrap gap-4 items-center">
              <span className="text-sm text-muted-foreground">
                {jobs.length} 支影片 · {favoriteCount} 已收藏
              </span>
              <Button asChild>
                <Link href={`/create?projectId=${project.id}`}>
                  <Plus className="w-4 h-4 mr-2" />
                  生成新影片
                </Link>
              </Button>
              {nonFavoriteCount > 0 && (
                <Button
                  variant="destructive"
                  onClick={handleCleanup}
                  disabled={cleaning}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {cleaning ? '刪除中...' : `刪除非收藏 (${nonFavoriteCount})`}
                </Button>
              )}
            </div>
          </div>

          {/* Videos grid */}
          {jobs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground mb-4">
                  這個專案還沒有影片
                </p>
                <Button asChild>
                  <Link href={`/create?projectId=${project.id}`}>
                    <Plus className="w-4 h-4 mr-2" />
                    生成第一支影片
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
              {jobs.map((job) => {
                const isPortrait = job.settings?.aspectRatio === '9:16';
                return (
                  <Card
                    key={job.id}
                    className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer relative group break-inside-avoid mb-4"
                    onClick={() => setSelectedJob(job)}
                  >
                    <div
                      className={cn(
                        'bg-black relative',
                        isPortrait ? 'aspect-[9/16]' : 'aspect-video'
                      )}
                    >
                      {videoErrors.has(job.id) ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <AlertCircle className="w-8 h-8" />
                          <span className="text-xs">載入失敗</span>
                        </div>
                      ) : (
                        <video
                          src={job.videoUrl}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                          onError={() =>
                            setVideoErrors((prev) => new Set(prev).add(job.id))
                          }
                        />
                      )}
                      {!videoErrors.has(job.id) && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white ml-0.5" />
                          </div>
                        </div>
                      )}
                      {/* Favorite star toggle */}
                      <button
                        className="absolute top-2 left-2 p-1 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                        onClick={(e) => handleToggleFavorite(job.id, e)}
                        title={job.favorite ? '取消收藏' : '收藏'}
                      >
                        <Star
                          className={cn(
                            'w-5 h-5',
                            job.favorite
                              ? 'text-yellow-400 fill-yellow-400'
                              : 'text-white'
                          )}
                        />
                      </button>
                    </div>
                    <CardContent className="p-3">
                      <h3 className="font-semibold truncate text-sm">{job.name}</h3>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Video modal */}
      {selectedJob && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedJob(null)}
        >
          <div
            className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-lg">{selectedJob.name}</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedJob(null)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="aspect-video bg-black">
              {videoErrors.has(selectedJob.id) ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                  <AlertCircle className="w-12 h-12" />
                  <p className="text-sm">影片連結可能已過期</p>
                </div>
              ) : (
                <video
                  src={selectedJob.videoUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                  onError={() =>
                    setVideoErrors((prev) => new Set(prev).add(selectedJob.id))
                  }
                />
              )}
            </div>
            <div className="p-4 border-t border-border flex gap-3">
              <Button asChild className="flex-1">
                <a
                  href={selectedJob.videoUrl}
                  download={`${selectedJob.name}.mp4`}
                >
                  <Download className="w-4 h-4 mr-2" />
                  下載
                </a>
              </Button>
              <Button variant="outline" asChild className="flex-1">
                <Link href={`/edit/${selectedJob.id}`}>
                  <Scissors className="w-4 h-4 mr-2" />
                  編輯
                </Link>
              </Button>
              <Button
                variant={selectedJob.favorite ? 'default' : 'outline'}
                size="icon"
                onClick={() => handleToggleFavorite(selectedJob.id)}
              >
                <Star
                  className={cn(
                    'w-4 h-4',
                    selectedJob.favorite && 'fill-current'
                  )}
                />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => handleDeleteJob(selectedJob.id)}
                disabled={deleting === selectedJob.id}
              >
                {deleting === selectedJob.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
