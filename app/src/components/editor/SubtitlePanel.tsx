'use client';

import { useState } from 'react';
import { useEditor, useEditorDispatch } from './EditorContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { generateId } from '@/lib/editor/timeline-utils';
import type { SubtitleSegment, SubtitlePosition } from '@/types/editor';
import { Plus, Trash2, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const POSITIONS: { key: SubtitlePosition; label: string }[] = [
  { key: 'top', label: '上' },
  { key: 'center', label: '中' },
  { key: 'bottom', label: '下' },
];

export function SubtitlePanel() {
  const state = useEditor();
  const dispatch = useEditorDispatch();
  const [generating, setGenerating] = useState(false);

  const handleAddManual = () => {
    const startTime = state.playheadPosition;
    const endTime = Math.min(startTime + 3, state.totalDuration);
    const segment: SubtitleSegment = {
      id: generateId(),
      text: '新字幕',
      startTime,
      endTime,
      position: 'bottom',
    };
    dispatch({ type: 'ADD_SUBTITLE', payload: segment });
    dispatch({ type: 'SELECT_SUBTITLE', payload: segment.id });
  };

  const handleAutoGenerate = async () => {
    if (state.clips.length === 0) return;
    setGenerating(true);

    try {
      // Extract audio from the first clip and send to transcription API
      const firstClip = state.clips[0];
      const response = await fetch(firstClip.blobUrl);
      const videoBlob = await response.blob();

      const formData = new FormData();
      formData.append('audio', videoBlob, 'audio.mp4');

      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'AI 字幕生成失敗');
      }

      const data = await res.json();
      const segments: SubtitleSegment[] = (data.segments || []).map(
        (s: { text: string; startTime: number; endTime: number }) => ({
          id: generateId(),
          text: s.text,
          startTime: s.startTime,
          endTime: s.endTime,
          position: 'bottom' as SubtitlePosition,
        })
      );

      if (segments.length > 0) {
        dispatch({ type: 'SET_SUBTITLES', payload: segments });
      } else {
        alert('未偵測到語音內容');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'AI 字幕生成失敗');
    } finally {
      setGenerating(false);
    }
  };

  const selectedSub = state.subtitles.find(s => s.id === state.selectedSubtitleId);

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <h3 className="font-semibold text-sm">字幕</h3>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={handleAddManual}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          手動新增
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={handleAutoGenerate}
          disabled={generating || state.clips.length === 0}
        >
          {generating ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 mr-1" />
          )}
          AI 生成
        </Button>
      </div>

      {/* Subtitle list */}
      {state.subtitles.length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground">
          <p>尚無字幕</p>
          <p className="mt-1">點擊「手動新增」或「AI 生成」</p>
        </div>
      ) : (
        <div className="space-y-1">
          {state.subtitles.map((sub) => (
            <button
              key={sub.id}
              onClick={() => {
                dispatch({ type: 'SELECT_SUBTITLE', payload: sub.id });
                dispatch({ type: 'SET_PLAYHEAD', payload: sub.startTime });
              }}
              className={cn(
                'w-full text-left p-2 rounded-md border text-xs transition-colors',
                state.selectedSubtitleId === sub.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium truncate">{sub.text}</span>
                <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                  {sub.startTime.toFixed(1)}s - {sub.endTime.toFixed(1)}s
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Selected subtitle editor */}
      {selectedSub && (
        <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">編輯字幕</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-destructive hover:text-destructive"
              onClick={() => dispatch({ type: 'REMOVE_SUBTITLE', payload: { id: selectedSub.id } })}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              刪除
            </Button>
          </div>

          {/* Text */}
          <div className="space-y-1">
            <Label className="text-[11px]">文字</Label>
            <Input
              value={selectedSub.text}
              onChange={(e) =>
                dispatch({
                  type: 'UPDATE_SUBTITLE',
                  payload: { id: selectedSub.id, updates: { text: e.target.value } },
                })
              }
              className="h-8 text-sm"
            />
          </div>

          {/* Timing */}
          <div className="space-y-1">
            <Label className="text-[11px]">
              時間: {selectedSub.startTime.toFixed(1)}s - {selectedSub.endTime.toFixed(1)}s
            </Label>
            <Slider
              min={0}
              max={Math.round(state.totalDuration * 100)}
              step={10}
              value={[
                Math.round(selectedSub.startTime * 100),
                Math.round(selectedSub.endTime * 100),
              ]}
              onValueChange={([s, e]) =>
                dispatch({
                  type: 'UPDATE_SUBTITLE',
                  payload: { id: selectedSub.id, updates: { startTime: s / 100, endTime: e / 100 } },
                })
              }
            />
          </div>

          {/* Position */}
          <div className="space-y-1">
            <Label className="text-[11px]">位置</Label>
            <div className="flex gap-1">
              {POSITIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() =>
                    dispatch({
                      type: 'UPDATE_SUBTITLE',
                      payload: { id: selectedSub.id, updates: { position: key } },
                    })
                  }
                  className={cn(
                    'flex-1 py-1 rounded text-xs border transition-colors',
                    selectedSub.position === key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
