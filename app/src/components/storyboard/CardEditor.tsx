'use client';

import type { StoryboardTitleCard } from '@/types';
import { COLOR_PRESETS } from '@/lib/constants';
import { CARD_TEMPLATES, getCardTemplate } from '@/lib/card-templates';

export interface CardEditorProps {
  label?: string;
  card: StoryboardTitleCard;
  onChange: (card: StoryboardTitleCard) => void;
  /** Show enable/disable toggle (used in title/outro modal) */
  showToggle?: boolean;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
}

/** Render a card preview using its template layout */
export function CardPreview({
  card,
  className = '',
}: {
  card: StoryboardTitleCard;
  className?: string;
}) {
  const template = getCardTemplate(card.templateId);

  const renderDivider = () => {
    if (!template.preview.divider || !card.subtitle) return null;
    const color = card.textColor;
    if (template.preview.divider === 'line') {
      return <div className="w-12 my-3 border-t-2" style={{ borderColor: `${color}40` }} />;
    }
    if (template.preview.divider === 'dot') {
      return (
        <div className="flex gap-1.5 my-4" style={{ color: `${color}60` }}>
          <span>·</span><span>·</span><span>·</span>
        </div>
      );
    }
    if (template.preview.divider === 'dash') {
      return <div className="w-8 my-4 border-t" style={{ borderColor: `${color}50` }} />;
    }
    return null;
  };

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundColor: card.backgroundColor }}
    >
      <div className={`absolute inset-0 ${template.preview.container}`}>
        <span
          className={template.preview.title}
          style={{ color: card.textColor }}
        >
          {card.text || '(無標題)'}
        </span>
        {renderDivider()}
        {card.subtitle && (
          <span
            className={template.preview.subtitle}
            style={{ color: card.textColor }}
          >
            {card.subtitle}
          </span>
        )}
      </div>
    </div>
  );
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
          {/* Live preview */}
          <CardPreview card={card} className="h-32 rounded-lg" />

          {/* Template picker */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">版型</label>
            <div className="grid grid-cols-3 gap-2">
              {CARD_TEMPLATES.map((template) => {
                const isSelected = (card.templateId || 'classic-center') === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onChange({ ...card, templateId: template.id })}
                    className={`relative rounded-lg border-2 overflow-hidden transition-all ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-border/50 hover:border-muted-foreground/50'
                    }`}
                  >
                    <CardPreview
                      card={{ ...card, text: card.text || '標題', subtitle: card.subtitle || '副標題', templateId: template.id }}
                      className="h-16"
                    />
                    <div className="px-1.5 py-1 text-[10px] text-center truncate bg-background/90">
                      {template.name}
                    </div>
                  </button>
                );
              })}
            </div>
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
