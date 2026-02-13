'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import type { GenerationJob } from '@/types';

interface AddToSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFromUpload: (files: File[]) => void;
  onAddFromGallery: (jobs: GenerationJob[], videoIndices: number[]) => void;
  galleryJobs: GenerationJob[];
  slotIndex: number;
  remainingSlots: number;
}

export function AddToSlotModal({
  isOpen,
  onClose,
  onAddFromUpload,
  onAddFromGallery,
  galleryJobs,
  slotIndex,
  remainingSlots,
}: AddToSlotModalProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'gallery'>('upload');
  const [selectedVideos, setSelectedVideos] = useState<{ jobId: string; videoIndex: number }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const videoFiles = Array.from(files).filter((f) => f.type.startsWith('video/'));
      if (videoFiles.length === 0) {
        alert('請選擇影片檔案');
        return;
      }

      // Limit to remaining slots
      const filesToAdd = videoFiles.slice(0, remainingSlots);
      onAddFromUpload(filesToAdd);
      onClose();
    },
    [remainingSlots, onAddFromUpload, onClose]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const toggleVideoSelection = (jobId: string, videoIndex: number) => {
    setSelectedVideos((prev) => {
      const exists = prev.some((v) => v.jobId === jobId && v.videoIndex === videoIndex);
      if (exists) {
        return prev.filter((v) => !(v.jobId === jobId && v.videoIndex === videoIndex));
      }
      if (prev.length >= remainingSlots) {
        return prev; // Don't exceed remaining slots
      }
      return [...prev, { jobId, videoIndex }];
    });
  };

  const handleAddFromGallery = () => {
    if (selectedVideos.length === 0) return;

    const jobsToAdd: GenerationJob[] = [];
    const indices: number[] = [];

    for (const { jobId, videoIndex } of selectedVideos) {
      const job = galleryJobs.find((j) => j.id === jobId);
      if (job) {
        jobsToAdd.push(job);
        indices.push(videoIndex);
      }
    }

    onAddFromGallery(jobsToAdd, indices);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background rounded-xl border border-border shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            新增影片到第 {slotIndex + 1} 格
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            從裝置上傳
          </button>
          <button
            onClick={() => setActiveTab('gallery')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'gallery'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            從影片庫選擇
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {activeTab === 'upload' && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragOver ? 'border-primary bg-primary/10' : 'border-border'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-lg font-medium mb-2">拖放影片檔案到這裡</p>
              <p className="text-sm text-muted-foreground mb-4">
                或點擊下方按鈕選擇檔案 (最多 {remainingSlots} 個)
              </p>
              <Button onClick={() => fileInputRef.current?.click()}>
                選擇檔案
              </Button>
            </div>
          )}

          {activeTab === 'gallery' && (
            <div>
              {galleryJobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>影片庫中沒有影片</p>
                  <p className="text-sm mt-1">先生成一些影片，再來這裡選擇</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-3">
                    選擇影片加入故事板 (已選 {selectedVideos.length}/{remainingSlots})
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {galleryJobs.map((job) => {
                      const videoUrls = job.videoUrls || (job.videoUrl ? [job.videoUrl] : []);
                      return videoUrls.map((url, idx) => {
                        const isSelected = selectedVideos.some(
                          (v) => v.jobId === job.id && v.videoIndex === idx
                        );
                        return (
                          <button
                            key={`${job.id}-${idx}`}
                            onClick={() => toggleVideoSelection(job.id, idx)}
                            className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-primary ring-2 ring-primary/30'
                                : 'border-transparent hover:border-border'
                            }`}
                          >
                            <video
                              src={url}
                              className="w-full h-full object-cover"
                              muted
                              preload="metadata"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                <svg className="w-4 h-4 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white">
                              {job.name || '影片'}
                            </div>
                          </button>
                        );
                      });
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === 'gallery' && selectedVideos.length > 0 && (
          <div className="p-4 border-t border-border">
            <Button onClick={handleAddFromGallery} className="w-full">
              加入 {selectedVideos.length} 個影片
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
