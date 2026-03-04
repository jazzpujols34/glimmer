'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Music, Upload, Play, Pause, Trash2, Loader2, Check } from 'lucide-react';
import type { StoryboardMusic } from '@/types';
import { BUNDLED_TRACKS as _BUNDLED_TRACKS } from '@/lib/constants';

interface MusicModalProps {
  storyboardId: string;
  music?: StoryboardMusic;
  onSave: (music: StoryboardMusic | null) => void;
  onClose: () => void;
}

const BUNDLED_TRACKS = _BUNDLED_TRACKS.map(t => ({
  id: t.id, filename: t.filename, name: t.name, duration: t.durationSeconds,
}));

type Tab = 'bundled' | 'upload';

export function MusicModal({ storyboardId, music, onSave, onClose }: MusicModalProps) {
  const [tab, setTab] = useState<Tab>('bundled');
  const [selectedMusic, setSelectedMusic] = useState<StoryboardMusic | null>(music || null);
  const [volume, setVolume] = useState(music?.volume ?? 0.3);
  const [previewTrack, setPreviewTrack] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const togglePreview = (trackId: string, src: string) => {
    if (previewTrack === trackId) {
      // Stop preview
      audioRef.current?.pause();
      setPreviewTrack(null);
    } else {
      // Start preview
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(src);
      audio.volume = volume;
      audio.play();
      audio.onended = () => setPreviewTrack(null);
      audioRef.current = audio;
      setPreviewTrack(trackId);
    }
  };

  const selectBundledTrack = (track: typeof BUNDLED_TRACKS[0]) => {
    setSelectedMusic({
      type: 'bundled',
      src: track.filename,
      name: track.name,
      volume,
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      alert('請選擇音訊檔案');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      alert('檔案大小不能超過 20MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('storyboardId', storyboardId);

      const response = await fetch('/api/upload-music', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '上傳失敗');
      }

      setSelectedMusic({
        type: 'uploaded',
        src: result.r2Key,
        name: result.name || file.name,
        volume,
      });
      setTab('bundled'); // Switch to show selection
    } catch (err) {
      alert(err instanceof Error ? err.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleSave = () => {
    if (selectedMusic) {
      onSave({ ...selectedMusic, volume });
    } else {
      onSave(null);
    }
    onClose();
  };

  const handleRemove = () => {
    setSelectedMusic(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">背景音樂</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setTab('bundled')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'bundled'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Music className="w-4 h-4 inline mr-1" />
            內建音樂
          </button>
          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'upload'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-1" />
            上傳音樂
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Current selection */}
          {selectedMusic && (
            <div className="mb-4 p-3 bg-primary/10 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{selectedMusic.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({selectedMusic.type === 'bundled' ? '內建' : '上傳'})
                </span>
              </div>
              <button
                onClick={handleRemove}
                className="p-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {tab === 'bundled' && (
            <div className="space-y-2">
              {BUNDLED_TRACKS.map((track) => {
                const isSelected = selectedMusic?.type === 'bundled' && selectedMusic.src === track.filename;
                const isPlaying = previewTrack === track.id;

                return (
                  <div
                    key={track.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                    onClick={() => selectBundledTrack(track)}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePreview(track.id, `/audio/bundled/${track.filename}`);
                      }}
                      className="p-2 rounded-full bg-muted hover:bg-muted-foreground/20"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{track.name}</p>
                      <p className="text-xs text-muted-foreground">{track.duration}秒</p>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-primary" />}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'upload' && (
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
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">上傳中...</p>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-2">
                    拖放音訊檔案到這裡
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    支援 MP3, WAV, M4A (最大 20MB)
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    選擇檔案
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </>
              )}
            </div>
          )}

          {/* Volume control */}
          {selectedMusic && (
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">音量</span>
                <span>{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            儲存
          </Button>
        </div>
      </div>
    </div>
  );
}
