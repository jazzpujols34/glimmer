'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useEditor, useEditorDispatch } from './EditorContext';
import { generateId } from '@/lib/editor/timeline-utils';
import type { TimelineClip } from '@/types/editor';
import { Plus, Check, Loader2, Film, X, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GalleryJob {
  id: string;
  name: string;
  occasion: string;
  videoUrl: string;
  videoUrls?: string[];
  createdAt: string;
}

const occasionLabels: Record<string, string> = {
  memorial: '追思紀念',
  birthday: '生日慶祝',
  wedding: '婚禮紀念',
  other: '其他',
};

type TabKey = 'gallery' | 'upload';

interface AddClipsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddClipsDialog({ open, onClose }: AddClipsDialogProps) {
  const state = useEditor();
  const dispatch = useEditorDispatch();
  const [tab, setTab] = useState<TabKey>('gallery');
  const [jobs, setJobs] = useState<GalleryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideos, setSelectedVideos] = useState<{ jobId: string; index: number; sourceUrl: string }[]>([]);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch gallery on open
  useEffect(() => {
    if (!open) return;
    setSelectedVideos([]);
    setLocalFiles([]);
    setTab('gallery');
    setLoading(true);

    fetch('/api/gallery')
      .then(res => res.json())
      .then(data => setJobs(data.jobs || []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  const existingUrls = new Set(state.clips.map(c => c.sourceUrl));

  const toggleVideo = (jobId: string, index: number, sourceUrl: string) => {
    setSelectedVideos(prev => {
      const exists = prev.find(v => v.jobId === jobId && v.index === index);
      if (exists) return prev.filter(v => !(v.jobId === jobId && v.index === index));
      return [...prev, { jobId, index, sourceUrl }];
    });
  };

  const isSelected = (jobId: string, index: number) =>
    selectedVideos.some(v => v.jobId === jobId && v.index === index);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const videoFiles = files.filter(f => f.type.startsWith('video/'));
    setLocalFiles(prev => [...prev, ...videoFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeLocalFile = (index: number) => {
    setLocalFiles(prev => prev.filter((_, i) => i !== index));
  };

  const totalToAdd = selectedVideos.length + localFiles.length;

  const handleAdd = async () => {
    if (totalToAdd === 0) return;
    setAdding(true);

    try {
      const clips: TimelineClip[] = [];

      // Process gallery selections
      if (selectedVideos.length > 0) {
        const galleryClips = await Promise.all(
          selectedVideos.map(async ({ jobId, index, sourceUrl }): Promise<TimelineClip> => {
            const proxyUrl = `/api/proxy-video?jobId=${encodeURIComponent(jobId)}&index=${index}`;
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error('影片載入失敗');
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const duration = await getVideoDuration(blobUrl);

            return {
              id: generateId(),
              sourceUrl,
              blobUrl,
              originalDuration: duration,
              trimStart: 0,
              trimEnd: duration,
              speed: 1,
              filter: null,
              volume: 1,
              timelinePosition: 0, // ADD_CLIPS reducer will set proper position
            };
          })
        );
        clips.push(...galleryClips);
      }

      // Process local files
      if (localFiles.length > 0) {
        const localClips = await Promise.all(
          localFiles.map(async (file): Promise<TimelineClip> => {
            const blobUrl = URL.createObjectURL(file);
            const duration = await getVideoDuration(blobUrl);

            return {
              id: generateId(),
              sourceUrl: `local://${file.name}`,
              blobUrl,
              originalDuration: duration,
              trimStart: 0,
              trimEnd: duration,
              speed: 1,
              filter: null,
              volume: 1,
              timelinePosition: 0, // ADD_CLIPS reducer will set proper position
            };
          })
        );
        clips.push(...localClips);
      }

      dispatch({ type: 'ADD_CLIPS', payload: clips });
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : '新增片段失敗');
    } finally {
      setAdding(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-lg">新增影片片段</h2>
            <p className="text-sm text-muted-foreground">從影片庫選擇或上傳本機檔案</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setTab('gallery')}
            className={cn(
              'flex-1 py-2.5 text-sm font-medium transition-colors',
              tab === 'gallery'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Film className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            影片庫
          </button>
          <button
            onClick={() => setTab('upload')}
            className={cn(
              'flex-1 py-2.5 text-sm font-medium transition-colors',
              tab === 'upload'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Upload className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            上傳檔案
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'gallery' && (
            <>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Film className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>影片庫中沒有已完成的影片</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {jobs.map(job => {
                    const urls = job.videoUrls?.length ? job.videoUrls : [job.videoUrl];
                    return (
                      <div key={job.id} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium">{job.name}</h3>
                          <span className="text-xs text-muted-foreground">
                            {occasionLabels[job.occasion] || job.occasion}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {urls.length} 支影片
                          </span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {urls.map((url, idx) => {
                            const alreadyInTimeline = existingUrls.has(url);
                            const selected = isSelected(job.id, idx);
                            return (
                              <button
                                key={idx}
                                disabled={alreadyInTimeline || adding}
                                onClick={() => toggleVideo(job.id, idx, url)}
                                className={cn(
                                  'relative w-32 h-20 rounded-md overflow-hidden border-2 transition-all',
                                  alreadyInTimeline
                                    ? 'border-muted opacity-50 cursor-not-allowed'
                                    : selected
                                      ? 'border-primary ring-2 ring-primary/30'
                                      : 'border-border hover:border-primary/50 cursor-pointer'
                                )}
                              >
                                <video
                                  src={url}
                                  className="w-full h-full object-cover"
                                  muted
                                  preload="metadata"
                                  onMouseEnter={e => e.currentTarget.play().catch(() => {})}
                                  onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                                />
                                {selected && (
                                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                    <Check className="w-6 h-6 text-primary" />
                                  </div>
                                )}
                                {alreadyInTimeline && (
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <span className="text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded">已加入</span>
                                  </div>
                                )}
                                <div className="absolute bottom-1 left-1 text-[10px] text-white bg-black/50 px-1 rounded">
                                  影片 {idx + 1}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone / file picker */}
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-primary'); }}
                onDragLeave={e => { e.currentTarget.classList.remove('border-primary'); }}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-primary');
                  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
                  setLocalFiles(prev => [...prev, ...files]);
                }}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">點擊選擇或拖曳影片檔案</p>
                <p className="text-xs text-muted-foreground mt-1">支援 MP4、MOV、WebM 格式</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {/* Selected local files */}
              {localFiles.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">已選擇的檔案 ({localFiles.length})</h3>
                  <div className="space-y-1">
                    {localFiles.map((file, idx) => (
                      <div
                        key={`${file.name}-${idx}`}
                        className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Film className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {(file.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-shrink-0 h-6 w-6 p-0"
                          onClick={() => removeLocalFile(idx)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <span className="text-sm text-muted-foreground">
            已選擇 {totalToAdd} 個片段
            {selectedVideos.length > 0 && localFiles.length > 0 && (
              <span className="ml-1">({selectedVideos.length} 影片庫 + {localFiles.length} 本機)</span>
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={adding}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={totalToAdd === 0 || adding}>
              {adding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  載入中...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  加入{totalToAdd > 0 ? ` (${totalToAdd})` : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getVideoDuration(blobUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = blobUrl;
    video.onloadedmetadata = () => { resolve(video.duration); video.src = ''; };
    video.onerror = () => { video.src = ''; reject(new Error('Failed to load video metadata')); };
  });
}
