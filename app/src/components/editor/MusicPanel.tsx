'use client';

import { useRef, useState } from 'react';
import { useEditor, useEditorDispatch } from './EditorContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { generateId } from '@/lib/editor/timeline-utils';
import type { MusicClip, BundledTrack } from '@/types/editor';
import type { OccasionType } from '@/types/index';
import { Upload, Play, Pause, Trash2, Music, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const BUNDLED_TRACKS: BundledTrack[] = [
  { id: 'gentle-piano', name: '溫柔鋼琴', filename: 'gentle-piano.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'memorial-01', name: '追思旋律', filename: 'memorial-01.mp3', occasion: 'memorial', durationSeconds: 60 },
  { id: 'birthday-01', name: '歡樂慶祝', filename: 'birthday-01.mp3', occasion: 'birthday', durationSeconds: 60 },
  { id: 'wedding-01', name: '浪漫時刻', filename: 'wedding-01.mp3', occasion: 'wedding', durationSeconds: 60 },
];

export function MusicPanel() {
  const state = useEditor();
  const dispatch = useEditorDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const selectedClip = state.musicClips.find(mc => mc.id === state.selectedMusicClipId);

  const handleSelectBundled = (track: BundledTrack) => {
    const musicClip: MusicClip = {
      id: generateId(),
      name: track.name,
      type: 'bundled',
      src: `/audio/bundled/${track.filename}`,
      blobUrl: `/audio/bundled/${track.filename}`,
      originalDuration: track.durationSeconds,
      trimStart: 0,
      trimEnd: track.durationSeconds,
      timelinePosition: state.playheadPosition,
      volume: 0.3,
    };
    dispatch({ type: 'ADD_MUSIC_CLIP', payload: musicClip });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      alert('請選擇音訊檔案 (MP3, WAV, etc.)');
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    const duration = await getAudioDuration(blobUrl);

    const musicClip: MusicClip = {
      id: generateId(),
      name: file.name.replace(/\.[^.]+$/, ''),
      type: 'uploaded',
      src: file.name,
      blobUrl,
      originalDuration: duration,
      trimStart: 0,
      trimEnd: duration,
      timelinePosition: state.playheadPosition,
      volume: 0.3,
    };
    dispatch({ type: 'ADD_MUSIC_CLIP', payload: musicClip });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const togglePreview = (trackId: string, src: string) => {
    if (previewingId === trackId) {
      previewAudioRef.current?.pause();
      setPreviewingId(null);
      return;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    const audio = new Audio(src);
    audio.volume = 0.5;
    audio.play().catch(() => {});
    audio.onended = () => setPreviewingId(null);
    previewAudioRef.current = audio;
    setPreviewingId(trackId);
  };

  // --- Selected clip properties mode ---
  if (selectedClip) {
    const effectiveDur = selectedClip.trimEnd - selectedClip.trimStart;
    return (
      <div className="p-4 space-y-5 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">音樂片段設定</h3>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => dispatch({ type: 'REMOVE_MUSIC_CLIP', payload: { id: selectedClip.id } })}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            移除
          </Button>
        </div>

        {/* Name + type */}
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-green-500 flex-shrink-0" />
          <span className="text-sm font-medium truncate">{selectedClip.name}</span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {selectedClip.type === 'bundled' ? '內建' : '上傳'}
          </span>
        </div>

        {/* Duration info */}
        <div className="text-xs text-muted-foreground">
          有效長度: {effectiveDur.toFixed(1)}s (原始: {selectedClip.originalDuration.toFixed(1)}s)
        </div>

        {/* Trim range */}
        <div className="space-y-2">
          <Label className="text-xs">裁剪範圍</Label>
          <Slider
            min={0}
            max={selectedClip.originalDuration * 100}
            step={1}
            value={[selectedClip.trimStart * 100, selectedClip.trimEnd * 100]}
            onValueChange={([s, e]) =>
              dispatch({
                type: 'UPDATE_MUSIC_CLIP',
                payload: { id: selectedClip.id, updates: { trimStart: s / 100, trimEnd: e / 100 } },
              })
            }
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{selectedClip.trimStart.toFixed(1)}s</span>
            <span>{selectedClip.trimEnd.toFixed(1)}s</span>
          </div>
        </div>

        {/* Volume */}
        <div className="space-y-1">
          <Label className="text-[11px]">音量: {Math.round(selectedClip.volume * 100)}%</Label>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[selectedClip.volume * 100]}
            onValueChange={([v]) =>
              dispatch({
                type: 'UPDATE_MUSIC_CLIP',
                payload: { id: selectedClip.id, updates: { volume: v / 100 } },
              })
            }
          />
        </div>

        {/* Position */}
        <div className="text-[10px] text-muted-foreground">
          時間軸位置: {selectedClip.timelinePosition.toFixed(1)}s
        </div>

        {/* Back to browser */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => dispatch({ type: 'SELECT_MUSIC_CLIP', payload: null })}
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          返回音樂瀏覽器
        </Button>
      </div>
    );
  }

  // --- Browser mode ---
  return (
    <div className="p-4 space-y-5 overflow-y-auto">
      <h3 className="font-semibold text-sm">背景音樂</h3>

      {/* Current music clips summary */}
      {state.musicClips.length > 0 && (
        <div className="text-xs text-muted-foreground">
          已新增 {state.musicClips.length} 個音樂片段 (點擊時間軸上的片段以編輯)
        </div>
      )}

      {/* Upload */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">上傳音樂</Label>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full border border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors"
        >
          <Upload className="w-6 h-6 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">MP3, WAV, M4A</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">新增至播放頭位置</p>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {/* Bundled tracks */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">內建音樂</Label>
        <div className="space-y-1">
          {BUNDLED_TRACKS.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-2 p-2 rounded-md border border-border hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => handleSelectBundled(track)}
            >
              <button
                className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePreview(track.id, `/audio/bundled/${track.filename}`);
                }}
              >
                {previewingId === track.id ? (
                  <Pause className="w-3 h-3" />
                ) : (
                  <Play className="w-3 h-3 ml-0.5" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">{track.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {track.occasion === 'all' ? '通用' : occasionLabel(track.occasion)} · 新增至播放頭
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          內建音樂檔案需放置於 public/audio/bundled/ 目錄
        </p>
      </div>
    </div>
  );
}

function occasionLabel(occasion: OccasionType): string {
  const map: Record<OccasionType, string> = {
    memorial: '追思',
    birthday: '生日',
    wedding: '婚禮',
    pet: '寵物',
    other: '其他',
  };
  return map[occasion] || occasion;
}

function getAudioDuration(blobUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio(blobUrl);
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
    };
    audio.onerror = () => resolve(60);
  });
}
