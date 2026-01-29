'use client';

import { useEditor, useEditorDispatch } from './EditorContext';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { getClipDuration } from '@/lib/editor/timeline-utils';
import type { FilterPreset } from '@/types/editor';
import { cn } from '@/lib/utils';

const FILTERS: { key: FilterPreset | null; label: string }[] = [
  { key: null, label: '原始' },
  { key: 'warm', label: '暖色' },
  { key: 'vintage', label: '復古' },
  { key: 'bw', label: '黑白' },
  { key: 'vivid', label: '鮮豔' },
];

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function ClipPropertiesPanel() {
  const state = useEditor();
  const dispatch = useEditorDispatch();

  const selectedClips = state.clips.filter(c => state.selectedClipIds.includes(c.id));

  // No selection
  if (selectedClips.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        點擊時間軸上的片段以編輯
      </div>
    );
  }

  // Multi-select summary
  if (selectedClips.length > 1) {
    return (
      <div className="p-4 space-y-5 overflow-y-auto">
        <h3 className="font-semibold text-sm">已選取 {selectedClips.length} 個片段</h3>

        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => dispatch({ type: 'REMOVE_SELECTED_CLIPS' })}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          移除所有選取片段
        </Button>

        {/* Bulk speed */}
        <div className="space-y-2">
          <Label className="text-xs">統一播放速度</Label>
          <div className="flex gap-1 flex-wrap">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                onClick={() => {
                  for (const clip of selectedClips) {
                    dispatch({ type: 'SET_SPEED', payload: { clipId: clip.id, speed } });
                  }
                }}
                className="px-2 py-1 rounded text-xs border border-border hover:border-primary/50 transition-colors"
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Bulk filter */}
        <div className="space-y-2">
          <Label className="text-xs">統一濾鏡</Label>
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map(({ key, label }) => (
              <button
                key={label}
                onClick={() => {
                  for (const clip of selectedClips) {
                    dispatch({ type: 'SET_FILTER', payload: { clipId: clip.id, filter: key } });
                  }
                }}
                className="px-2 py-1 rounded text-xs border border-border hover:border-primary/50 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[10px] text-muted-foreground space-y-1">
          <p>快捷鍵: ⇧← 靠左 · ⇧→ 靠右</p>
          <p>⌫ 刪除 · ⇧⌫ 漣漪刪除</p>
        </div>
      </div>
    );
  }

  // Single selection — existing editor
  const clip = selectedClips[0];
  const effectiveDuration = getClipDuration(clip);

  return (
    <div className="p-4 space-y-5 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">片段設定</h3>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => dispatch({ type: 'REMOVE_CLIP', payload: { clipId: clip.id } })}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          移除
        </Button>
      </div>

      {/* Duration info */}
      <div className="text-xs text-muted-foreground">
        有效長度: {effectiveDuration.toFixed(1)}s (原始: {clip.originalDuration.toFixed(1)}s)
      </div>

      {/* Trim */}
      <div className="space-y-2">
        <Label className="text-xs">裁剪範圍</Label>
        <Slider
          min={0}
          max={clip.originalDuration * 100}
          step={1}
          value={[clip.trimStart * 100, clip.trimEnd * 100]}
          onValueChange={([start, end]) =>
            dispatch({
              type: 'SET_TRIM',
              payload: { clipId: clip.id, trimStart: start / 100, trimEnd: end / 100 },
            })
          }
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{(clip.trimStart).toFixed(1)}s</span>
          <span>{(clip.trimEnd).toFixed(1)}s</span>
        </div>
      </div>

      {/* Speed */}
      <div className="space-y-2">
        <Label className="text-xs">播放速度</Label>
        <div className="flex gap-1 flex-wrap">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              onClick={() => dispatch({ type: 'SET_SPEED', payload: { clipId: clip.id, speed } })}
              className={cn(
                'px-2 py-1 rounded text-xs border transition-colors',
                clip.speed === speed
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="space-y-2">
        <Label className="text-xs">濾鏡</Label>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(({ key, label }) => (
            <button
              key={label}
              onClick={() =>
                dispatch({ type: 'SET_FILTER', payload: { clipId: clip.id, filter: key } })
              }
              className={cn(
                'px-2 py-1 rounded text-xs border transition-colors',
                clip.filter === key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Volume */}
      <div className="space-y-2">
        <Label className="text-xs">原始音量</Label>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[clip.volume * 100]}
          onValueChange={([v]) =>
            dispatch({ type: 'SET_CLIP_VOLUME', payload: { clipId: clip.id, volume: v / 100 } })
          }
        />
        <div className="text-[10px] text-muted-foreground text-right">
          {Math.round(clip.volume * 100)}%
        </div>
      </div>
    </div>
  );
}
