'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useNSFWCheck } from '@/hooks/useNSFWCheck';

interface PhotoUploaderProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  maxPhotos?: number;
}

export function PhotoUploader({ photos, onPhotosChange, maxPhotos = 10 }: PhotoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [nsfwWarning, setNsfwWarning] = useState<string | null>(null);
  const { checkFiles, isLoading: isChecking } = useNSFWCheck();

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    setNsfwWarning(null);

    // Check for NSFW content
    const { safe, blocked } = await checkFiles(fileArray);

    if (blocked.length > 0) {
      const fileDetails = blocked
        .map(b => `${b.file.name} (系統判定為不當內容，信心度 ${(b.confidence * 100).toFixed(0)}%)`)
        .join('、');
      setNsfwWarning(
        `已移除 ${blocked.length} 張圖片：${fileDetails}。如果這是誤判，請換一張照片或聯繫我們。`
      );
      // Auto-dismiss warning after 8 seconds
      setTimeout(() => setNsfwWarning(null), 8000);
    }

    if (safe.length === 0) return;

    const newPhotos = [...photos, ...safe].slice(0, maxPhotos);
    onPhotosChange(newPhotos);

    // Generate previews
    const newPreviews = newPhotos.map(file => URL.createObjectURL(file));
    setPreviews(prev => {
      prev.forEach(url => URL.revokeObjectURL(url));
      return newPreviews;
    });
  }, [photos, onPhotosChange, maxPhotos, checkFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
    setPreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const movePhoto = (from: number, to: number) => {
    if (to < 0 || to >= photos.length) return;
    const newPhotos = [...photos];
    const [moved] = newPhotos.splice(from, 1);
    newPhotos.splice(to, 0, moved);
    onPhotosChange(newPhotos);

    const newPreviews = [...previews];
    const [movedPreview] = newPreviews.splice(from, 1);
    newPreviews.splice(to, 0, movedPreview);
    setPreviews(newPreviews);
  };

  return (
    <div className="space-y-4">
      {/* NSFW Warning */}
      {nsfwWarning && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{nsfwWarning}</span>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer relative
          ${isDragging
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary/50 hover:bg-card/50'
          }
          ${isChecking ? 'pointer-events-none opacity-70' : ''}
        `}
        onClick={() => !isChecking && document.getElementById('photo-input')?.click()}
      >
        {isChecking && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-xl">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              檢查圖片中...
            </div>
          </div>
        )}
        <input
          id="photo-input"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={isChecking}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium">拖放照片到這裡</p>
            <p className="text-sm text-muted-foreground">或點擊選擇檔案 (最多 {maxPhotos} 張)</p>
          </div>
        </div>
      </div>

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              已選擇 {photos.length} / {maxPhotos} 張照片
            </p>
            <Button variant="ghost" size="sm" onClick={() => {
              onPhotosChange([]);
              previews.forEach(url => URL.revokeObjectURL(url));
              setPreviews([]);
            }}>
              清除全部
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {previews.map((preview, index) => (
              <div key={index} className="relative group aspect-square rounded-lg overflow-hidden bg-card border border-border">
                <Image
                  src={preview}
                  alt={`Photo ${index + 1}`}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); movePhoto(index, index - 1); }}
                    disabled={index === 0}
                    className="p-1.5 rounded bg-white/20 hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removePhoto(index); }}
                    className="p-1.5 rounded bg-red-500/80 hover:bg-red-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); movePhoto(index, index + 1); }}
                    disabled={index === photos.length - 1}
                    className="p-1.5 rounded bg-white/20 hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                  {index + 1}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            提示：照片順序就是影片播放順序，可拖動調整
          </p>
        </div>
      )}
    </div>
  );
}
