'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { StoryboardSubtitle, SubtitlePosition } from '@/types';

interface SubtitleModalProps {
  subtitles: StoryboardSubtitle[];
  totalDuration: number;
  onSave: (subtitles: StoryboardSubtitle[]) => void;
  onClose: () => void;
}

let subCounter = 0;
function genSubId() {
  return `sub_${Date.now()}_${subCounter++}`;
}

const POSITION_LABELS: Record<SubtitlePosition, string> = {
  top: '上方',
  center: '中央',
  bottom: '下方',
};

export function SubtitleModal({ subtitles: initialSubtitles, totalDuration, onSave, onClose }: SubtitleModalProps) {
  const [subtitles, setSubtitles] = useState<StoryboardSubtitle[]>(initialSubtitles);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const addSubtitle = () => {
    // Default: start at end of last subtitle, or 0
    const lastEnd = subtitles.length > 0 ? subtitles[subtitles.length - 1].endTime : 0;
    const newSub: StoryboardSubtitle = {
      id: genSubId(),
      text: '',
      startTime: lastEnd,
      endTime: Math.min(lastEnd + 3, totalDuration || 60),
      position: 'bottom',
    };
    setSubtitles(prev => [...prev, newSub]);
  };

  const updateSubtitle = (id: string, updates: Partial<StoryboardSubtitle>) => {
    setSubtitles(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeSubtitle = (id: string) => {
    setSubtitles(prev => prev.filter(s => s.id !== id));
  };

  const moveSubtitle = (id: string, direction: -1 | 1) => {
    setSubtitles(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  const handleSave = () => {
    // Filter out empty text subtitles
    const valid = subtitles.filter(s => s.text.trim());
    onSave(valid);
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
          <h2 className="text-lg font-semibold">字幕</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {totalDuration > 0 && (
            <p className="text-xs text-muted-foreground">
              影片總長：{formatTime(totalDuration)}
            </p>
          )}

          {subtitles.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">尚未新增字幕</p>
              <p className="text-xs mt-1">點擊下方按鈕新增字幕段落</p>
            </div>
          )}

          {/* Subtitle List */}
          {subtitles.map((sub, idx) => (
            <div key={sub.id} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">字幕 {idx + 1}</span>
                <div className="flex items-center gap-1">
                  {subtitles.length > 1 && (
                    <>
                      <button
                        onClick={() => moveSubtitle(sub.id, -1)}
                        disabled={idx === 0}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => moveSubtitle(sub.id, 1)}
                        disabled={idx === subtitles.length - 1}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => removeSubtitle(sub.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Text */}
              <input
                type="text"
                value={sub.text}
                onChange={(e) => updateSubtitle(sub.id, { text: e.target.value })}
                placeholder="輸入字幕文字..."
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />

              {/* Time range */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">開始</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="range"
                      min={0}
                      max={totalDuration || 60}
                      step={0.5}
                      value={sub.startTime}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        updateSubtitle(sub.id, {
                          startTime: v,
                          endTime: Math.max(sub.endTime, v + 0.5),
                        });
                      }}
                      className="flex-1"
                    />
                    <span className="text-xs w-8 text-right">{formatTime(sub.startTime)}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">結束</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="range"
                      min={sub.startTime + 0.5}
                      max={totalDuration || 60}
                      step={0.5}
                      value={sub.endTime}
                      onChange={(e) => updateSubtitle(sub.id, { endTime: parseFloat(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs w-8 text-right">{formatTime(sub.endTime)}</span>
                  </div>
                </div>
              </div>

              {/* Position */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">位置</span>
                <div className="flex gap-1">
                  {(['top', 'center', 'bottom'] as SubtitlePosition[]).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => updateSubtitle(sub.id, { position: pos })}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        sub.position === pos
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {POSITION_LABELS[pos]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <Button variant="outline" className="w-full" onClick={addSubtitle}>
            <Plus className="w-4 h-4 mr-1" />
            新增字幕
          </Button>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            儲存 {subtitles.length > 0 ? `(${subtitles.length} 條)` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
