'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, X } from 'lucide-react';

interface FrameUploaderProps {
  firstFrame: File | null;
  lastFrame: File | null;
  onFirstFrameChange: (file: File | null) => void;
  onLastFrameChange: (file: File | null) => void;
}

function FrameSlot({
  label,
  subtitle,
  file,
  preview,
  required,
  onFileChange,
  onClear,
}: {
  label: string;
  subtitle: string;
  file: File | null;
  preview: string | null;
  required?: boolean;
  onFileChange: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile?.type.startsWith('image/')) {
        onFileChange(droppedFile);
      }
    },
    [onFileChange]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile?.type.startsWith('image/')) {
        onFileChange(selectedFile);
      }
      // Reset input so re-selecting the same file works
      e.target.value = '';
    },
    [onFileChange]
  );

  return (
    <div className="flex-1">
      <div className="mb-2 text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </div>
      <div className="text-xs text-muted-foreground mb-2">{subtitle}</div>

      {preview && file ? (
        <div className="relative aspect-square rounded-lg overflow-hidden border border-border bg-card">
          <Image src={preview} alt={label} fill className="object-cover" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`aspect-square rounded-lg border-2 border-dashed cursor-pointer flex flex-col items-center justify-center gap-2 transition-colors ${
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          }`}
        >
          <ImagePlus className="w-8 h-8 text-muted-foreground" />
          <span className="text-xs text-muted-foreground text-center px-2">
            點擊或拖放圖片
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}

export function FrameUploader({
  firstFrame,
  lastFrame,
  onFirstFrameChange,
  onLastFrameChange,
}: FrameUploaderProps) {
  const [firstPreview, setFirstPreview] = useState<string | null>(null);
  const [lastPreview, setLastPreview] = useState<string | null>(null);

  const handleFirstFrame = useCallback(
    (file: File) => {
      onFirstFrameChange(file);
      setFirstPreview(URL.createObjectURL(file));
    },
    [onFirstFrameChange]
  );

  const handleLastFrame = useCallback(
    (file: File) => {
      onLastFrameChange(file);
      setLastPreview(URL.createObjectURL(file));
    },
    [onLastFrameChange]
  );

  const clearFirst = useCallback(() => {
    if (firstPreview) URL.revokeObjectURL(firstPreview);
    setFirstPreview(null);
    onFirstFrameChange(null);
  }, [firstPreview, onFirstFrameChange]);

  const clearLast = useCallback(() => {
    if (lastPreview) URL.revokeObjectURL(lastPreview);
    setLastPreview(null);
    onLastFrameChange(null);
  }, [lastPreview, onLastFrameChange]);

  return (
    <div className="space-y-3">
      <div className="flex gap-4">
        <FrameSlot
          label="首幀 (First Frame)"
          subtitle="影片的起始畫面"
          file={firstFrame}
          preview={firstPreview}
          required
          onFileChange={handleFirstFrame}
          onClear={clearFirst}
        />
        <div className="flex items-center self-center pt-8">
          <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
        <FrameSlot
          label="末幀 (Last Frame)"
          subtitle="影片的結束畫面"
          file={lastFrame}
          preview={lastPreview}
          onFileChange={handleLastFrame}
          onClear={clearLast}
        />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        上傳首幀（必要）與末幀（選填），AI 將生成兩幀之間的平滑過渡影片
      </p>
    </div>
  );
}
