'use client';

import { useRef } from 'react';
import { useEditor, useEditorDispatch } from './EditorContext';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { generateId } from '@/lib/editor/timeline-utils';
import type { SfxItem } from '@/types/editor';
import { Upload, Plus, Trash2, Zap } from 'lucide-react';
import { getAudioDuration } from '@/lib/media-utils';

export function SfxPanel() {
  const state = useEditor();
  const dispatch = useEditorDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      alert('請選擇音訊檔案 (MP3, WAV, etc.)');
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    const duration = await getAudioDuration(blobUrl, 1);

    const sfxItem: SfxItem = {
      id: generateId(),
      name: file.name.replace(/\.[^.]+$/, ''),
      blobUrl,
      startTime: state.playheadPosition,
      duration,
      volume: 0.8,
    };
    dispatch({ type: 'ADD_SFX', payload: sfxItem });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-4 space-y-5 overflow-y-auto">
      <h3 className="font-semibold text-sm">音效</h3>

      {/* Upload */}
      <div className="space-y-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full border border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors"
        >
          <Upload className="w-6 h-6 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs font-medium">上傳音效檔案</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">MP3, WAV, M4A</p>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleUpload}
        />

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
        >
          <Plus className="w-4 h-4 mr-1" />
          在播放頭位置新增音效
        </Button>
      </div>

      {/* SFX list */}
      {state.sfx.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Zap className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">尚未新增音效</p>
          <p className="text-[10px] mt-1">上傳音訊檔案作為音效</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Label className="text-xs font-medium">已新增的音效 ({state.sfx.length})</Label>
          {state.sfx.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-lg bg-muted/50 border border-border space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Zap className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{item.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  onClick={() => dispatch({ type: 'REMOVE_SFX', payload: { id: item.id } })}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="text-[10px] text-muted-foreground">
                開始: {item.startTime.toFixed(1)}s · 長度: {item.duration.toFixed(1)}s
              </div>

              {/* Start time */}
              <div className="space-y-1">
                <Label className="text-[10px]">開始時間</Label>
                <Slider
                  min={0}
                  max={Math.max(state.totalDuration * 100, 100)}
                  step={1}
                  value={[item.startTime * 100]}
                  onValueChange={([v]) =>
                    dispatch({
                      type: 'UPDATE_SFX',
                      payload: { id: item.id, updates: { startTime: v / 100 } },
                    })
                  }
                />
              </div>

              {/* Volume */}
              <div className="space-y-1">
                <Label className="text-[10px]">音量: {Math.round(item.volume * 100)}%</Label>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[item.volume * 100]}
                  onValueChange={([v]) =>
                    dispatch({
                      type: 'UPDATE_SFX',
                      payload: { id: item.id, updates: { volume: v / 100 } },
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

