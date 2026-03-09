'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Music, Upload, Play, Pause, Trash2, Loader2, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import type { StoryboardMusicTrack } from '@/types';
import { BUNDLED_TRACKS as _BUNDLED_TRACKS } from '@/lib/constants';

interface MusicModalProps {
  storyboardId: string;
  musicTracks: StoryboardMusicTrack[];
  totalDuration: number; // total video duration in seconds (for timeline context)
  onSave: (tracks: StoryboardMusicTrack[]) => void;
  onClose: () => void;
}

const BUNDLED_TRACKS = _BUNDLED_TRACKS.map(t => ({
  id: t.id, filename: t.filename, name: t.name, duration: t.durationSeconds,
}));

let trackCounter = 0;
function genTrackId() {
  return `mt_${Date.now()}_${trackCounter++}`;
}

export function MusicModal({ storyboardId, musicTracks, totalDuration, onSave, onClose }: MusicModalProps) {
  const [tracks, setTracks] = useState<StoryboardMusicTrack[]>(musicTracks);
  const [showPicker, setShowPicker] = useState(musicTracks.length === 0);
  const [pickerTab, setPickerTab] = useState<'bundled' | 'upload'>('bundled');
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

  // Handle Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const togglePreview = (trackId: string, src: string) => {
    if (previewTrack === trackId) {
      audioRef.current?.pause();
      setPreviewTrack(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(src);
      audio.volume = 0.5;
      audio.play();
      audio.onended = () => setPreviewTrack(null);
      audioRef.current = audio;
      setPreviewTrack(trackId);
    }
  };

  const addBundledTrack = (track: typeof BUNDLED_TRACKS[0]) => {
    const newTrack: StoryboardMusicTrack = {
      id: genTrackId(),
      type: 'bundled',
      src: track.filename,
      name: track.name,
      volume: 0.3,
      timelinePosition: 0,
      trimStart: 0,
      trimEnd: Math.min(track.duration, totalDuration || track.duration),
    };
    setTracks(prev => [...prev, newTrack]);
    setShowPicker(false);
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
      if (!response.ok) throw new Error(result.error || '上傳失敗');

      const newTrack: StoryboardMusicTrack = {
        id: genTrackId(),
        type: 'uploaded',
        src: result.r2Key,
        name: result.name || file.name,
        volume: 0.3,
        timelinePosition: 0,
        trimStart: 0,
        trimEnd: totalDuration || 60,
      };
      setTracks(prev => [...prev, newTrack]);
      setShowPicker(false);
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

  const updateTrack = useCallback((id: string, updates: Partial<StoryboardMusicTrack>) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const removeTrack = (id: string) => {
    setTracks(prev => prev.filter(t => t.id !== id));
  };

  const moveTrack = (id: string, direction: -1 | 1) => {
    setTracks(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  const handleSave = () => {
    onSave(tracks);
    onClose();
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">背景音樂</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Timeline context */}
          {totalDuration > 0 && (
            <p className="text-xs text-muted-foreground">
              影片總長：{formatTime(totalDuration)}
            </p>
          )}

          {/* Track List */}
          {tracks.length > 0 && (
            <div className="space-y-3">
              {tracks.map((track, idx) => (
                <div key={track.id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Music className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm font-medium truncate">{track.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({track.type === 'bundled' ? '內建' : '上傳'})
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {tracks.length > 1 && (
                        <>
                          <button
                            onClick={() => moveTrack(track.id, -1)}
                            disabled={idx === 0}
                            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => moveTrack(track.id, 1)}
                            disabled={idx === tracks.length - 1}
                            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => removeTrack(track.id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-8">音量</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={track.volume}
                      onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs w-8 text-right">{Math.round(track.volume * 100)}%</span>
                  </div>

                  {/* Timeline Position */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-8">起始</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(totalDuration - 1, 0)}
                      step={0.5}
                      value={track.timelinePosition}
                      onChange={(e) => updateTrack(track.id, { timelinePosition: parseFloat(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs w-10 text-right">{formatTime(track.timelinePosition)}</span>
                  </div>

                  {/* Trim End (how much of the audio to use) */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-8">長度</span>
                    <input
                      type="range"
                      min={1}
                      max={120}
                      step={1}
                      value={track.trimEnd - track.trimStart}
                      onChange={(e) => updateTrack(track.id, { trimEnd: track.trimStart + parseFloat(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs w-10 text-right">{formatTime(track.trimEnd - track.trimStart)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Track Button */}
          {!showPicker && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowPicker(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              新增音樂軌道
            </Button>
          )}

          {/* Track Picker */}
          {showPicker && (
            <div className="border border-border rounded-lg overflow-hidden">
              {/* Picker Tabs */}
              <div className="flex border-b border-border">
                <button
                  type="button"
                  onClick={() => setPickerTab('bundled')}
                  className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                    pickerTab === 'bundled'
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Music className="w-4 h-4 inline mr-1" />
                  內建音樂
                </button>
                <button
                  type="button"
                  onClick={() => setPickerTab('upload')}
                  className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                    pickerTab === 'upload'
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Upload className="w-4 h-4 inline mr-1" />
                  上傳音樂
                </button>
              </div>

              <div className="p-3 max-h-[40vh] overflow-y-auto">
                {pickerTab === 'bundled' && (
                  <div className="space-y-1.5">
                    {BUNDLED_TRACKS.map((track) => {
                      const isPlaying = previewTrack === track.id;
                      return (
                        <div
                          key={track.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:border-muted-foreground/50 transition-colors cursor-pointer"
                          onClick={() => addBundledTrack(track)}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePreview(track.id, `/audio/bundled/${track.filename}`);
                            }}
                            className="p-1.5 rounded-full bg-muted hover:bg-muted-foreground/20"
                          >
                            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{track.name}</p>
                            <p className="text-xs text-muted-foreground">{track.duration}秒</p>
                          </div>
                          <Plus className="w-4 h-4 text-muted-foreground" />
                        </div>
                      );
                    })}
                  </div>
                )}

                {pickerTab === 'upload' && (
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      dragOver ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
                        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground mb-2">拖放音訊檔案到這裡</p>
                        <p className="text-xs text-muted-foreground mb-3">MP3, WAV, M4A (最大 20MB)</p>
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
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
              </div>

              {/* Cancel picker */}
              {tracks.length > 0 && (
                <div className="p-2 border-t border-border">
                  <button
                    onClick={() => setShowPicker(false)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                  >
                    取消新增
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            儲存 {tracks.length > 0 ? `(${tracks.length} 軌)` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
