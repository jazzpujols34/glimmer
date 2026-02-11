'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, Download, Calendar, Film, ArrowLeft, Trash2, Scissors, AlertCircle, X, Star, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

type GalleryFilter = 'all' | 'favorites' | 'projects';

interface GalleryJob {
  id: string;
  name: string;
  occasion: string;
  videoUrl: string;
  videoUrls?: string[];
  createdAt: string;
  favorite?: boolean;
  projectId?: string;
  settings?: {
    model: string;
    aspectRatio: string;
    videoLength: number;
    resolution: string;
  };
}

const occasionLabels: Record<string, string> = {
  memorial: '追思紀念',
  birthday: '生日慶祝',
  wedding: '婚禮紀念',
  pet: '寵物紀念',
  other: '其他',
};

export default function GalleryPage() {
  const [jobs, setJobs] = useState<GalleryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<GalleryJob | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [videoErrors, setVideoErrors] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<GalleryFilter>('all');

  // Close modal on Escape key
  const closeModal = useCallback(() => setSelectedJob(null), []);
  useEffect(() => {
    if (!selectedJob) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedJob, closeModal]);

  useEffect(() => {
    async function loadGallery() {
      try {
        const res = await fetch('/api/gallery');
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || '載入失敗');
        }
        const data = await res.json();
        setJobs(data.jobs || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗');
      } finally {
        setLoading(false);
      }
    }

    loadGallery();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm('確定要刪除這支影片嗎？此操作無法復原。')) return;

    setDeleting(jobId);
    try {
      const res = await fetch(`/api/gallery/${jobId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '刪除失敗');
      }
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleFavorite = async (jobId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await fetch(`/api/gallery/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Toggle
      });
      if (!res.ok) {
        throw new Error('更新失敗');
      }
      const data = await res.json();
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, favorite: data.favorite } : j))
      );
      if (selectedJob?.id === jobId) {
        setSelectedJob((prev) => prev ? { ...prev, favorite: data.favorite } : null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '更新失敗');
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <Button variant="outline" asChild>
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回首頁
            </Link>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-4">影片庫</h1>
            <p className="text-muted-foreground">
              瀏覽您過去生成的所有影片
            </p>
          </div>

          {/* Tabs */}
          <div className="flex justify-center gap-2 mb-8">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              <Film className="w-4 h-4 mr-2" />
              全部 ({jobs.length})
            </Button>
            <Button
              variant={filter === 'favorites' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('favorites')}
            >
              <Star className="w-4 h-4 mr-2" />
              收藏 ({jobs.filter(j => j.favorite).length})
            </Button>
            <Button
              variant={filter === 'projects' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('projects')}
              asChild
            >
              <Link href="/projects">
                <FolderOpen className="w-4 h-4 mr-2" />
                專案
              </Link>
            </Button>
          </div>

          {(() => {
            // Filter jobs based on selected tab
            const filteredJobs = filter === 'favorites'
              ? jobs.filter(j => j.favorite)
              : jobs;

            if (loading) {
              return (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="overflow-hidden">
                      <div className="aspect-video bg-muted animate-pulse" />
                      <CardContent className="p-4 space-y-2">
                        <div className="h-5 bg-muted animate-pulse rounded w-2/3" />
                        <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            }

            if (error) {
              return (
                <Card className="max-w-md mx-auto">
                  <CardContent className="p-8 text-center">
                    <p className="text-destructive mb-4">{error}</p>
                    <Button onClick={() => window.location.reload()}>重試</Button>
                  </CardContent>
                </Card>
              );
            }

            if (jobs.length === 0) {
              return (
                <Card className="max-w-md mx-auto">
                  <CardContent className="p-8 text-center">
                    <Film className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                    <h2 className="text-xl font-semibold mb-2">還沒有影片</h2>
                    <p className="text-muted-foreground mb-2">
                      您生成的影片會自動出現在這裡
                    </p>
                    <p className="text-muted-foreground/60 text-xs mb-6">
                      影片連結有效期限為 24 小時，請及時下載保存
                    </p>
                    <Button asChild>
                      <Link href="/create">開始製作</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            }

            // Show empty state for favorites filter when no favorites
            if (filteredJobs.length === 0 && filter === 'favorites') {
              return (
                <Card className="max-w-md mx-auto">
                  <CardContent className="p-8 text-center">
                    <Star className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                    <h2 className="text-xl font-semibold mb-2">還沒有收藏</h2>
                    <p className="text-muted-foreground mb-4">
                      點擊影片中的星星圖示來收藏喜愛的影片
                    </p>
                    <Button variant="outline" onClick={() => setFilter('all')}>
                      查看所有影片
                    </Button>
                  </CardContent>
                </Card>
              );
            }

            return (
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredJobs.map((job) => {
                const isPortrait = job.settings?.aspectRatio === '9:16';
                return (
                <Card
                  key={job.id}
                  className={cn(
                    "overflow-hidden hover:shadow-lg transition-shadow cursor-pointer",
                    isPortrait && "row-span-2"
                  )}
                  onClick={() => setSelectedJob(job)}
                >
                  <div className={cn(
                    "bg-black relative",
                    isPortrait ? "aspect-[9/16]" : "aspect-video"
                  )}>
                    {videoErrors.has(job.id) ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                        <AlertCircle className="w-8 h-8" />
                        <span className="text-xs">影片載入失敗</span>
                      </div>
                    ) : (
                      <video
                        src={job.videoUrl}
                        className="w-full h-full object-contain"
                        muted
                        playsInline
                        preload="metadata"
                        onError={() => setVideoErrors(prev => new Set(prev).add(job.id))}
                      />
                    )}
                    {!videoErrors.has(job.id) && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                          <Play className="w-5 h-5 text-white ml-0.5" />
                        </div>
                      </div>
                    )}
                    {job.videoUrls && job.videoUrls.length > 1 && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/50 text-white text-xs">
                        {job.videoUrls.length} 支影片
                      </div>
                    )}
                    {/* Favorite star */}
                    {job.favorite && (
                      <div className="absolute top-2 left-2">
                        <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <h3 className="font-semibold truncate text-sm">{job.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Film className="w-3 h-3" />
                        {occasionLabels[job.occasion] || job.occasion}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(job.createdAt).split(' ')[0]}
                      </span>
                    </div>
                    </CardContent>
                  </Card>
                );
              })}
              </div>
            );
          })()}
        </div>
      </main>

      {/* Video modal */}
      {selectedJob && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={selectedJob.name}
        >
          <div
            className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">{selectedJob.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {occasionLabels[selectedJob.occasion]} · {formatDate(selectedJob.createdAt)}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeModal} aria-label="關閉">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="aspect-video bg-black">
              {videoErrors.has(selectedJob.id) ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                  <AlertCircle className="w-12 h-12" />
                  <p className="text-sm">影片連結可能已過期</p>
                  <p className="text-xs text-muted-foreground/60">Video link may have expired</p>
                </div>
              ) : (
                <video
                  src={selectedJob.videoUrl}
                  controls
                  autoPlay
                  preload="auto"
                  className="w-full h-full object-contain"
                  onError={() => setVideoErrors(prev => new Set(prev).add(selectedJob.id))}
                />
              )}
            </div>
            {selectedJob.videoUrls && selectedJob.videoUrls.length > 1 && (
              <div className="p-4 border-t border-border">
                <p className="text-sm text-muted-foreground mb-2">
                  所有影片 ({selectedJob.videoUrls.length})
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {selectedJob.videoUrls.map((url, index) => (
                    <a
                      key={index}
                      href={url}
                      download={`${selectedJob.name}-${index + 1}.mp4`}
                      className="flex-shrink-0 px-3 py-2 rounded bg-muted hover:bg-muted/80 text-sm flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      影片 {index + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="p-4 border-t border-border flex gap-3">
              <Button asChild className="flex-1">
                <a href={selectedJob.videoUrl} download={`${selectedJob.name}.mp4`}>
                  <Download className="w-4 h-4 mr-2" />
                  下載影片
                </a>
              </Button>
              <Button variant="outline" asChild className="flex-1">
                <Link href={`/edit/${selectedJob.id}`}>
                  <Scissors className="w-4 h-4 mr-2" />
                  編輯影片
                </Link>
              </Button>
              <Button
                variant={selectedJob.favorite ? "default" : "outline"}
                size="icon"
                onClick={() => handleToggleFavorite(selectedJob.id)}
                title={selectedJob.favorite ? "取消收藏" : "收藏"}
              >
                <Star className={cn("w-4 h-4", selectedJob.favorite && "fill-current")} />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => handleDelete(selectedJob.id)}
                disabled={deleting === selectedJob.id}
                title="刪除影片"
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

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2026 拾光 Glimmer. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
