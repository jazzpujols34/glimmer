'use client';

import type { StoryboardTitleCard } from '@/types';
import { COLOR_PRESETS } from '@/lib/constants';

export interface CardEditorProps {
  label?: string;
  card: StoryboardTitleCard;
  onChange: (card: StoryboardTitleCard) => void;
  /** Show enable/disable toggle (used in title/outro modal) */
  showToggle?: boolean;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
}

export function CardEditor({ label, card, onChange, showToggle, enabled = true, onToggle }: CardEditorProps) {
  return (
    <div className="space-y-4">
      {(label || showToggle) && (
        <div className="flex items-center justify-between">
          {label && <span className="font-medium">{label}</span>}
          {showToggle && onToggle && (
            <button
              type="button"
              onClick={() => onToggle(!enabled)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                enabled
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {enabled ? '已啟用' : '未啟用'}
            </button>
          )}
        </div>
      )}

      {enabled && (
        <div className={`space-y-4 ${showToggle ? 'pl-2 border-l-2 border-primary/30' : ''}`}>
          {/* Preview */}
          <div
            className="h-20 rounded-lg flex flex-col items-center justify-center"
            style={{ backgroundColor: card.backgroundColor }}
          >
            <span
              className="text-lg font-bold"
              style={{ color: card.textColor }}
            >
              {card.text || '(無標題)'}
            </span>
            {card.subtitle && (
              <span
                className="text-sm"
                style={{ color: card.textColor }}
              >
                {card.subtitle}
              </span>
            )}
          </div>

          {/* Text inputs */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">主標題</label>
            <input
              type="text"
              value={card.text}
              onChange={(e) => onChange({ ...card, text: e.target.value })}
              placeholder="輸入主標題"
              className="w-full px-3 py-2 bg-muted rounded-md text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">副標題（選填）</label>
            <input
              type="text"
              value={card.subtitle || ''}
              onChange={(e) => onChange({ ...card, subtitle: e.target.value })}
              placeholder="輸入副標題"
              className="w-full px-3 py-2 bg-muted rounded-md text-sm"
            />
          </div>

          {/* Duration slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">顯示時間</span>
              <span>{card.durationSeconds} 秒</span>
            </div>
            <input
              type="range"
              min={1}
              max={8}
              step={0.5}
              value={card.durationSeconds}
              onChange={(e) => onChange({ ...card, durationSeconds: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* Color presets */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">配色</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...card,
                      backgroundColor: preset.bg,
                      textColor: preset.text,
                    })
                  }
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    card.backgroundColor === preset.bg
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-transparent hover:border-muted-foreground/50'
                  }`}
                  style={{ backgroundColor: preset.bg }}
                  title={preset.label}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function defaultTextCard(): StoryboardTitleCard {
  return {
    text: '',
    subtitle: '',
    durationSeconds: 3,
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
  };
}
