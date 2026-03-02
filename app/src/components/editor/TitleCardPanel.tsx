'use client';

import { useEditor, useEditorDispatch } from './EditorContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { generateId } from '@/lib/editor/timeline-utils';
import type { TitleCard } from '@/types/editor';
import { cn } from '@/lib/utils';

const COLOR_PRESETS = [
  // Classic
  { bg: '#000000', text: '#ffffff', label: '黑底白字' },
  { bg: '#ffffff', text: '#1a1a1a', label: '白底黑字' },
  { bg: '#1e293b', text: '#e2e8f0', label: '深藍' },
  { bg: '#fef3c7', text: '#78350f', label: '暖黃' },
  { bg: '#f3e8ff', text: '#581c87', label: '淡紫' },
  // Elegant tones
  { bg: '#85325c', text: '#f0eada', label: '玫瑰木' },
  { bg: '#3d348b', text: '#e1e2dc', label: '皇家靛' },
  { bg: '#73362a', text: '#f0eada', label: '可可棕' },
  { bg: '#aa7733', text: '#f5edd7', label: '金銅色' },
  { bg: '#73754c', text: '#edeae5', label: '橄欖綠' },
];

function defaultCard(type: 'intro' | 'outro'): TitleCard {
  return {
    id: generateId(),
    type,
    text: type === 'intro' ? '拾光' : '謝謝觀看',
    subtitle: type === 'intro' ? '珍貴的回憶' : '',
    durationSeconds: 3,
    backgroundColor: '#000000',
    textColor: '#ffffff',
  };
}

export function TitleCardPanel() {
  const state = useEditor();
  const dispatch = useEditorDispatch();
  const { titleCard, outroCard } = state;

  const toggleIntro = () => {
    dispatch({
      type: 'SET_TITLE_CARD',
      payload: titleCard ? null : defaultCard('intro'),
    });
  };

  const toggleOutro = () => {
    dispatch({
      type: 'SET_OUTRO_CARD',
      payload: outroCard ? null : defaultCard('outro'),
    });
  };

  return (
    <div className="p-4 space-y-6 overflow-y-auto">
      <h3 className="font-semibold text-sm">片頭片尾</h3>

      {/* Intro card */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">片頭卡</Label>
          <Button
            variant={titleCard ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={toggleIntro}
          >
            {titleCard ? '已啟用' : '啟用'}
          </Button>
        </div>
        {titleCard && (
          <CardEditor
            card={titleCard}
            onChange={(updates) =>
              dispatch({ type: 'SET_TITLE_CARD', payload: { ...titleCard, ...updates } })
            }
          />
        )}
      </section>

      <div className="border-t border-border" />

      {/* Outro card */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">片尾卡</Label>
          <Button
            variant={outroCard ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={toggleOutro}
          >
            {outroCard ? '已啟用' : '啟用'}
          </Button>
        </div>
        {outroCard && (
          <CardEditor
            card={outroCard}
            onChange={(updates) =>
              dispatch({ type: 'SET_OUTRO_CARD', payload: { ...outroCard, ...updates } })
            }
          />
        )}
      </section>
    </div>
  );
}

function CardEditor({
  card,
  onChange,
}: {
  card: TitleCard;
  onChange: (updates: Partial<TitleCard>) => void;
}) {
  return (
    <div className="space-y-3 pl-1">
      {/* Title text */}
      <div className="space-y-1">
        <Label className="text-[11px]">主標題</Label>
        <Input
          value={card.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="輸入標題文字"
          className="h-8 text-sm"
        />
      </div>

      {/* Subtitle */}
      <div className="space-y-1">
        <Label className="text-[11px]">副標題</Label>
        <Input
          value={card.subtitle ?? ''}
          onChange={(e) => onChange({ subtitle: e.target.value })}
          placeholder="輸入副標題（選填）"
          className="h-8 text-sm"
        />
      </div>

      {/* Duration */}
      <div className="space-y-1">
        <Label className="text-[11px]">顯示時間: {card.durationSeconds}s</Label>
        <Slider
          min={100}
          max={800}
          step={50}
          value={[card.durationSeconds * 100]}
          onValueChange={([v]) => onChange({ durationSeconds: v / 100 })}
        />
      </div>

      {/* Color presets */}
      <div className="space-y-1">
        <Label className="text-[11px]">配色</Label>
        <div className="flex gap-1.5 flex-wrap">
          {COLOR_PRESETS.map(({ bg, text, label }) => (
            <button
              key={label}
              title={label}
              onClick={() => onChange({ backgroundColor: bg, textColor: text })}
              className={cn(
                'w-8 h-8 rounded border-2 transition-all flex items-center justify-center text-[9px] font-bold',
                card.backgroundColor === bg && card.textColor === text
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-primary/50'
              )}
              style={{ backgroundColor: bg, color: text }}
            >
              Aa
            </button>
          ))}
        </div>
      </div>

      {/* Mini preview */}
      <div
        className="rounded-md h-16 flex flex-col items-center justify-center"
        style={{ backgroundColor: card.backgroundColor, color: card.textColor }}
      >
        <span className="text-sm font-bold">{card.text || '標題'}</span>
        {card.subtitle && <span className="text-[10px] mt-0.5">{card.subtitle}</span>}
      </div>
    </div>
  );
}
