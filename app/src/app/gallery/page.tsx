'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useTranslation } from '@/lib/i18n';
import { useAccess } from '@/hooks/useAccess';
import { OCCASION_LABELS } from '@/lib/constants';
import { Play, Download, Calendar, Film, ArrowLeft, Trash2, Scissors, AlertCircle, X, Star, FolderOpen, ChevronDown, Clock, Lock, CheckSquare, Square, Wand2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trackGalleryView } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import type { Project } from '@/types';

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


export default function GalleryPage() {
  const t = useTranslation();
  const { hasPaidAccess } = useAccess();
  const [jobs, setJobs] = useState<GalleryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<GalleryJob | null>(null);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [videoErrors, setVideoErrors] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [movingToProject, setMovingToProject] = useState(false);
  const [loadedVideos, setLoadedVideos] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{ updated: number; checked: number } | null>(null);

  // Stable clip labels: map URL → original letter label (set when modal opens)
  const clipLabelsRef = useRef<Map<string, string>>(new Map());

  const initClipLabels = (job: GalleryJob) => {
    const urls = job.videoUrls || [job.videoUrl];
    // Only initialize if not already set for this job's URLs
    const alreadySet = urls.some(url => clipLabelsRef.current.has(url));
    if (!alreadySet) {
      clipLabelsRef.current.clear();
      urls.forEach((url, i) => {
        clipLabelsRef.current.set(url, String.fromCharCode(65 + i));
      });
    }
  };

  const getClipLabel = (url: string, fallbackIndex: number): string => {
    return clipLabelsRef.current.get(url) || String.fromCharCode(65 + fallbackIndex);
  };

  // Multi-select for showcase builder
  const [selectMode, setSelectMode] = useState(false);
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set()); // Format: "jobId:videoIndex"

  const toggleClipSelection = (jobId: string, videoIndex: number) => {
    const key = `${jobId}:${videoIndex}`;
    setSelectedClips(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedClips(new Set());
    setSelectMode(false);
  };

  // Close modal on Escape key
  const closeModal = useCallback(() => {
    setSelectedJob(null);
    setSelectedVideoIndex(0);
  }, []);
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
        const jobList = data.jobs || [];
        setJobs(jobList);
        trackGalleryView(jobList.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗');
      } finally {
        setLoading(false);
      }
    }

    loadGallery();
  }, []);

  // Refresh all processing jobs by polling external providers
  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch('/api/gallery/refresh', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setRefreshResult({ updated: data.updated, checked: data.checked });
        // Reload gallery if any jobs were updated
        if (data.updated > 0) {
          const galleryRes = await fetch('/api/gallery');
          if (galleryRes.ok) {
            const galleryData = await galleryRes.json();
            setJobs(galleryData.jobs || []);
          }
        }
        // Clear result message after 5 seconds
        setTimeout(() => setRefreshResult(null), 5000);
      }
    } catch (err) {
      logger.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Load projects for the dropdown
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
        }
      } catch { /* ignore */ }
    }
    loadProjects();
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

  // Calculate hours remaining until 24h expiration
  // R2-archived videos (proxy URLs) never expire
  const getExpirationInfo = (createdAt: string, videoUrl?: string) => {
    // R2-archived videos use proxy URL and never expire
    if (videoUrl?.startsWith('/api/proxy-video')) {
      return { hoursRemaining: Infinity, isExpired: false, isExpiringSoon: false, isArchived: true };
    }
    const created = new Date(createdAt).getTime();
    const expiresAt = created + 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();
    const hoursRemaining = Math.max(0, Math.floor((expiresAt - now) / (60 * 60 * 1000)));
    const isExpired = hoursRemaining <= 0;
    const isExpiringSoon = hoursRemaining > 0 && hoursRemaining <= 6;
    return { hoursRemaining, isExpired, isExpiringSoon, isArchived: false };
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm('確定要刪除所有影片嗎？此操作無法復原。')) return;

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

  const handleDeleteClip = async (jobId: string, videoIndex: number, clipLabel: string) => {
    if (!confirm(`確定要刪除影片 ${clipLabel} 嗎？`)) return;

    setDeleting(`${jobId}-${videoIndex}`);
    try {
      const res = await fetch(`/api/gallery/${jobId}?videoIndex=${videoIndex}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '刪除失敗');
      }

      if (data.deleted === 'job') {
        // Entire job was deleted (last clip)
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        setSelectedJob(null);
      } else {
        // Update job with remaining clips
        setJobs((prev) => prev.map((j) =>
          j.id === jobId ? { ...j, videoUrls: data.videoUrls, videoUrl: data.videoUrls[0] } : j
        ));
        if (selectedJob?.id === jobId) {
          setSelectedJob((prev) => prev ? {
            ...prev,
            videoUrls: data.videoUrls,
            videoUrl: data.videoUrls[0]
          } : null);
          // Reset to first video if current was deleted
          if (selectedVideoIndex >= data.videoUrls.length) {
            setSelectedVideoIndex(0);
          }
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setDeleting(null);
    }
  };

  const handleKeepOnlyClip = async (jobId: string, keepIndex: number, clipLabel: string) => {
    const job = jobs.find(j => j.id === jobId);
    const totalClips = job?.videoUrls?.length || 0;
    if (totalClips <= 1) return;

    if (!confirm(`只保留影片 ${clipLabel}，刪除其餘 ${totalClips - 1} 個影片？`)) return;

    setDeleting(`${jobId}-keep`);
    try {
      // Single atomic API call — server keeps only the specified index
      const res = await fetch(`/api/gallery/${jobId}?keepOnly=${keepIndex}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');

      const updatedVideoUrls = data.videoUrls || [];
      setJobs((prev) => prev.map((j) =>
        j.id === jobId ? { ...j, videoUrls: updatedVideoUrls, videoUrl: updatedVideoUrls[0] } : j
      ));
      if (selectedJob?.id === jobId) {
        setSelectedJob((prev) => prev ? {
          ...prev,
          videoUrls: updatedVideoUrls,
          videoUrl: updatedVideoUrls[0]
        } : null);
        setSelectedVideoIndex(0);
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

  const handleMoveToProject = async (jobId: string, projectId: string | null) => {
    setMovingToProject(true);
    try {
      const res = await fetch(`/api/gallery/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        throw new Error('移動失敗');
      }
      const data = await res.json();
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, projectId: data.projectId } : j))
      );
      if (selectedJob?.id === jobId) {
        setSelectedJob((prev) => prev ? { ...prev, projectId: data.projectId } : null);
      }
      setProjectDropdownOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '移動失敗');
    } finally {
      setMovingToProject(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            {hasPaidAccess ? (
              <Button asChild>
                <Link href="/storyboard/new">
                  <Film className="w-4 h-4 mr-2" />
                  {t('gallery.createStoryboard')}
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/upgrade">
                  <Lock className="w-4 h-4 mr-2" />
                  {t('gallery.createStoryboard')}
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('nav.home')}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-4">{t('gallery.title')}</h1>
            <p className="text-muted-foreground">
              {t('gallery.subtitle')}
            </p>
          </div>

          {/* Tabs + Select Mode */}
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              <Film className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">全部</span> ({jobs.length})
            </Button>
            <Button
              variant={filter === 'favorites' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('favorites')}
            >
              <Star className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">收藏</span> ({jobs.filter(j => j.favorite).length})
            </Button>
            {hasPaidAccess && (
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
            )}
            <div className="w-px bg-border mx-1" />
            <Button
              variant={selectMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (selectMode) {
                  clearSelection();
                } else {
                  setSelectMode(true);
                }
              }}
            >
              {selectMode ? (
                <>
                  <X className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">取消選取</span>
                </>
              ) : (
                <>
                  <CheckSquare className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">選取製作</span>
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              title="重新檢查生成中的影片狀態"
            >
              <RefreshCw className={cn("w-4 h-4 sm:mr-2", refreshing && "animate-spin")} />
              <span className="hidden sm:inline">{refreshing ? '檢查中...' : '刷新'}</span>
            </Button>
          </div>

          {/* Refresh result message */}
          {refreshResult && (
            <div className="text-center text-sm text-muted-foreground">
              {refreshResult.updated > 0 ? (
                <span className="text-green-600">✓ 已更新 {refreshResult.updated} 支影片</span>
              ) : refreshResult.checked > 0 ? (
                <span>已檢查 {refreshResult.checked} 個任務，暫無新影片</span>
              ) : (
                <span>沒有進行中的任務</span>
              )}
            </div>
          )}

          {/* Selection bar */}
          {selectMode && (
            <div className="flex items-center justify-center gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
              <span className="text-sm">
                已選取 <strong>{selectedClips.size}</strong> 支影片
              </span>
              {selectedClips.size >= 2 && (
                <Button size="sm" asChild>
                  <Link href={`/showcase?clips=${encodeURIComponent(Array.from(selectedClips).join(','))}`}>
                    <Wand2 className="w-4 h-4 mr-2" />
                    製作展示影片
                  </Link>
                </Button>
              )}
              {selectedClips.size > 0 && selectedClips.size < 2 && (
                <span className="text-sm text-muted-foreground">再選 {2 - selectedClips.size} 支影片</span>
              )}
            </div>
          )}

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
                    <h2 className="text-xl font-semibold mb-2">{t('gallery.empty')}</h2>
                    <p className="text-muted-foreground mb-2">
                      {t('gallery.emptyDesc')}
                    </p>
                    <p className="text-muted-foreground/60 text-xs mb-6">
                      {t('generate.expirationDesc')}
                    </p>
                    <Button asChild>
                      <Link href="/create">{t('gallery.createFirst')}</Link>
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
              <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                {filteredJobs.map((job) => {
                const isPortrait = job.settings?.aspectRatio === '9:16';
                const expiration = getExpirationInfo(job.createdAt, job.videoUrl);
                return (
                <Card
                  key={job.id}
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer break-inside-avoid mb-4"
                  onClick={() => {
                    if (selectMode) {
                      // In select mode, clicking card with single video toggles selection
                      if (!job.videoUrls || job.videoUrls.length === 1) {
                        toggleClipSelection(job.id, 0);
                      } else {
                        // For multi-video jobs, open modal to select specific clips
                        initClipLabels(job);
                        setSelectedJob(job);
                      }
                    } else {
                      initClipLabels(job);
                      setSelectedJob(job);
                    }
                  }}
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
                      <>
                        {/* Loading skeleton - shows until video metadata loads */}
                        {!loadedVideos.has(job.id) && (
                          <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
                            <Film className="w-8 h-8 text-muted-foreground/50" />
                          </div>
                        )}
                        <video
                          src={job.videoUrl}
                          className={cn(
                            "w-full h-full object-cover transition-opacity duration-300",
                            loadedVideos.has(job.id) ? "opacity-100" : "opacity-0"
                          )}
                          muted
                          playsInline
                          preload="metadata"
                          onLoadedData={() => setLoadedVideos(prev => new Set(prev).add(job.id))}
                          onError={() => setVideoErrors(prev => new Set(prev).add(job.id))}
                        />
                      </>
                    )}
                    {!videoErrors.has(job.id) && loadedVideos.has(job.id) && (
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
                    {job.favorite && !selectMode && (
                      <div className="absolute top-2 left-2">
                        <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                      </div>
                    )}
                    {/* Selection checkbox */}
                    {selectMode && (
                      <div className="absolute top-2 left-2">
                        {(() => {
                          // Check if any video from this job is selected
                          const videoCount = job.videoUrls?.length || 1;
                          const selectedCount = Array.from(selectedClips).filter(key => key.startsWith(`${job.id}:`)).length;
                          const isFullySelected = selectedCount === videoCount;
                          const isPartiallySelected = selectedCount > 0 && selectedCount < videoCount;

                          return (
                            <div className={cn(
                              "w-6 h-6 rounded flex items-center justify-center",
                              isFullySelected ? "bg-primary text-primary-foreground" :
                              isPartiallySelected ? "bg-primary/50 text-primary-foreground" :
                              "bg-white/80 text-muted-foreground"
                            )}>
                              {isFullySelected ? (
                                <CheckSquare className="w-4 h-4" />
                              ) : isPartiallySelected ? (
                                <span className="text-xs font-bold">{selectedCount}</span>
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {/* Expiration warning badge */}
                    {expiration.isExpiringSoon && !expiration.isExpired && (
                      <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-amber-500/90 text-white text-xs flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {expiration.hoursRemaining}h
                      </div>
                    )}
                    {expiration.isExpired && (
                      <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-destructive/90 text-white text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        已過期
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <h3 className="font-semibold truncate text-sm">{job.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Film className="w-3 h-3" />
                        {OCCASION_LABELS[job.occasion] || job.occasion}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(job.createdAt).split(' ')[0]}
                      </span>
                      {expiration.isExpiringSoon && !expiration.isExpired && (
                        <span className="flex items-center gap-1 text-amber-500">
                          <Clock className="w-3 h-3" />
                          剩 {expiration.hoursRemaining} 小時
                        </span>
                      )}
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
            {(() => {
              const modalExpiration = getExpirationInfo(selectedJob.createdAt, selectedJob.videoUrl);
              return (
                <>
                  {/* Expiration warning banner */}
                  {modalExpiration.isExpiringSoon && !modalExpiration.isExpired && (
                    <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">
                        此影片將在 {modalExpiration.hoursRemaining} 小時後過期，請盡快下載保存
                      </span>
                    </div>
                  )}
                  {modalExpiration.isExpired && (
                    <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2 text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">
                        此影片連結可能已過期，如無法播放請重新生成
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">{selectedJob.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {OCCASION_LABELS[selectedJob.occasion]} · {formatDate(selectedJob.createdAt)}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeModal} aria-label="關閉">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="aspect-video bg-black">
              {videoErrors.has(`${selectedJob.id}-${selectedVideoIndex}`) ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                  <AlertCircle className="w-12 h-12" />
                  <p className="text-sm">影片連結可能已過期</p>
                  <p className="text-xs text-muted-foreground/60">Video link may have expired</p>
                </div>
              ) : (
                <video
                  key={`${selectedJob.id}-${selectedVideoIndex}`}
                  src={selectedJob.videoUrls?.[selectedVideoIndex] || selectedJob.videoUrl}
                  controls
                  autoPlay
                  preload="auto"
                  className="w-full h-full object-contain"
                  onError={() => setVideoErrors(prev => new Set(prev).add(`${selectedJob.id}-${selectedVideoIndex}`))}
                />
              )}
            </div>
            {selectedJob.videoUrls && selectedJob.videoUrls.length > 1 && (
              <div className="p-4 border-t border-border">
                <p className="text-sm text-muted-foreground mb-2">
                  {selectMode ? '選取要加入展示影片的片段' : `選擇影片 (${getClipLabel(selectedJob.videoUrls[selectedVideoIndex], selectedVideoIndex)}/${selectedJob.videoUrls.length})`}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {selectedJob.videoUrls.map((url, index) => {
                    const clipLabel = getClipLabel(url, index);
                    const clipKey = `${selectedJob.id}:${index}`;
                    const isClipSelected = selectedClips.has(clipKey);
                    const isCurrentClip = selectedVideoIndex === index;

                    return (
                    <div key={url} className="flex-shrink-0 flex items-center gap-1">
                      {selectMode && (
                        <button
                          onClick={() => toggleClipSelection(selectedJob.id, index)}
                          className={cn(
                            "px-2 py-2 rounded-l text-sm transition-colors",
                            isClipSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted hover:bg-muted/80"
                          )}
                          title={isClipSelected ? "取消選取" : "選取此影片"}
                        >
                          {isClipSelected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedVideoIndex(index)}
                        className={cn(
                          "px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                          selectMode ? "" : "rounded-l",
                          isCurrentClip
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80"
                        )}
                      >
                        <Play className="w-4 h-4" />
                        影片 {clipLabel}
                      </button>
                      {!selectMode && isCurrentClip && selectedJob.videoUrls!.length > 1 && (
                        <button
                          onClick={() => handleKeepOnlyClip(selectedJob.id, index, clipLabel)}
                          disabled={deleting !== null}
                          className="px-2 py-2 text-sm transition-colors bg-primary/80 text-primary-foreground hover:bg-green-600"
                          title="只保留這個影片，刪除其餘"
                        >
                          {deleting === `${selectedJob.id}-keep` ? (
                            <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <Star className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      {!selectMode && (
                        <button
                          onClick={() => handleDeleteClip(selectedJob.id, index, clipLabel)}
                          disabled={deleting !== null}
                          className={cn(
                            "px-2 py-2 rounded-r text-sm transition-colors",
                            isCurrentClip
                              ? "bg-primary/80 text-primary-foreground hover:bg-destructive"
                              : "bg-muted hover:bg-destructive hover:text-destructive-foreground"
                          )}
                          title={`刪除影片 ${clipLabel}`}
                        >
                          {deleting === `${selectedJob.id}-${index}` ? (
                            <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  )})}
                </div>
              </div>
            )}
            <div className="p-4 border-t border-border flex flex-wrap gap-2 sm:gap-3">
              <Button asChild className="flex-1 min-w-[120px]">
                <a
                  href={selectedJob.videoUrls?.[selectedVideoIndex] || selectedJob.videoUrl}
                  download={`${selectedJob.name}${selectedJob.videoUrls && selectedJob.videoUrls.length > 1 ? `-${getClipLabel(selectedJob.videoUrls[selectedVideoIndex], selectedVideoIndex)}` : ''}.mp4`}
                >
                  <Download className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">下載影片</span>
                  <span className="sm:hidden">下載</span>
                </a>
              </Button>
              {hasPaidAccess ? (
                <Button variant="outline" asChild className="flex-1 min-w-[120px]">
                  <Link href={`/edit/${selectedJob.id}`}>
                    <Scissors className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">編輯影片</span>
                    <span className="sm:hidden">編輯</span>
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" asChild className="flex-1 min-w-[120px]">
                  <Link href="/upgrade">
                    <Lock className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">編輯影片</span>
                    <span className="sm:hidden">編輯</span>
                  </Link>
                </Button>
              )}
              <Button
                variant={selectedJob.favorite ? "default" : "outline"}
                size="icon"
                onClick={() => handleToggleFavorite(selectedJob.id)}
                title={selectedJob.favorite ? "取消收藏" : "收藏"}
              >
                <Star className={cn("w-4 h-4", selectedJob.favorite && "fill-current")} />
              </Button>
              {/* Move to project dropdown - only for paid users */}
              {hasPaidAccess && (
                <div className="relative">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                    disabled={movingToProject}
                    title="移動到專案"
                  >
                    {movingToProject ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                    ) : (
                      <FolderOpen className="w-4 h-4" />
                    )}
                  </Button>
                  {projectDropdownOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 bg-background border border-border rounded-lg shadow-lg py-1 z-10">
                      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                        移動到專案
                      </div>
                      {selectedJob.projectId && (
                        <button
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                          onClick={() => handleMoveToProject(selectedJob.id, null)}
                        >
                          <X className="w-4 h-4" />
                          移出專案
                        </button>
                      )}
                      {projects.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          尚無專案
                        </div>
                      ) : (
                        projects.map((project) => (
                          <button
                            key={project.id}
                            className={cn(
                              "w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2",
                              selectedJob.projectId === project.id && "bg-muted"
                            )}
                            onClick={() => handleMoveToProject(selectedJob.id, project.id)}
                            disabled={selectedJob.projectId === project.id}
                          >
                            <FolderOpen className="w-4 h-4" />
                            {project.name}
                            {selectedJob.projectId === project.id && (
                              <span className="text-xs text-muted-foreground ml-auto">目前</span>
                            )}
                          </button>
                        ))
                      )}
                      <Link
                        href="/projects"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 border-t border-border text-primary"
                      >
                        <ChevronDown className="w-4 h-4" />
                        管理專案
                      </Link>
                    </div>
                  )}
                </div>
              )}
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
          <p>{t('footer.copyright')}</p>
        </div>
      </footer>
    </div>
  );
}
