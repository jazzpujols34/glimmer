'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { StoryboardTitleCard } from '@/types';
import { COLOR_PRESETS } from '@/lib/constants';

interface TitleCardModalProps {
  titleCard?: StoryboardTitleCard;
  outroCard?: StoryboardTitleCard;
  onSave: (titleCard: StoryboardTitleCard | null, outroCard: StoryboardTitleCard | null) => void;
  onClose: () => void;
}

function defaultTitleCard(type: 'intro' | 'outro'): StoryboardTitleCard {
  return {
    text: type === 'intro' ? '拾光' : '謝謝觀看',
    subtitle: type === 'intro' ? '珍貴的回憶' : '',
    durationSeconds: 3,
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
  };
}

interface CardEditorProps {
  label: string;
  card: StoryboardTitleCard | null;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onChange: (card: StoryboardTitleCard) => void;
  defaultCard: StoryboardTitleCard;
}

function CardEditor({ label, card, enabled, onToggle, onChange, defaultCard }: CardEditorProps) {
  const currentCard = card || defaultCard;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
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
      </div>

      {enabled && (
        <div className="space-y-4 pl-2 border-l-2 border-primary/30">
          {/* Preview */}
          <div
            className="h-20 rounded-lg flex flex-col items-center justify-center"
            style={{ backgroundColor: currentCard.backgroundColor }}
          >
            <span
              className="text-lg font-bold"
              style={{ color: currentCard.textColor }}
            >
              {currentCard.text || '(無標題)'}
            </span>
            {currentCard.subtitle && (
              <span
                className="text-sm"
                style={{ color: currentCard.textColor }}
              >
                {currentCard.subtitle}
              </span>
            )}
          </div>

          {/* Text inputs */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">主標題</label>
            <input
              type="text"
              value={currentCard.text}
              onChange={(e) => onChange({ ...currentCard, text: e.target.value })}
              placeholder="輸入主標題"
              className="w-full px-3 py-2 bg-muted rounded-md text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">副標題（選填）</label>
            <input
              type="text"
              value={currentCard.subtitle || ''}
              onChange={(e) => onChange({ ...currentCard, subtitle: e.target.value })}
              placeholder="輸入副標題"
              className="w-full px-3 py-2 bg-muted rounded-md text-sm"
            />
          </div>

          {/* Duration slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">顯示時間</span>
              <span>{currentCard.durationSeconds} 秒</span>
            </div>
            <input
              type="range"
              min={1}
              max={8}
              step={0.5}
              value={currentCard.durationSeconds}
              onChange={(e) => onChange({ ...currentCard, durationSeconds: parseFloat(e.target.value) })}
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
                      ...currentCard,
                      backgroundColor: preset.bg,
                      textColor: preset.text,
                    })
                  }
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    currentCard.backgroundColor === preset.bg
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

export function TitleCardModal({ titleCard, outroCard, onSave, onClose }: TitleCardModalProps) {
  const [introEnabled, setIntroEnabled] = useState(!!titleCard);
  const [outroEnabled, setOutroEnabled] = useState(!!outroCard);
  const [intro, setIntro] = useState<StoryboardTitleCard>(titleCard || defaultTitleCard('intro'));
  const [outro, setOutro] = useState<StoryboardTitleCard>(outroCard || defaultTitleCard('outro'));

  const handleSave = () => {
    onSave(
      introEnabled ? intro : null,
      outroEnabled ? outro : null
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">片頭 / 片尾設定</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <CardEditor
            label="片頭卡"
            card={introEnabled ? intro : null}
            enabled={introEnabled}
            onToggle={setIntroEnabled}
            onChange={setIntro}
            defaultCard={defaultTitleCard('intro')}
          />

          <div className="border-t border-border" />

          <CardEditor
            label="片尾卡"
            card={outroEnabled ? outro : null}
            enabled={outroEnabled}
            onToggle={setOutroEnabled}
            onChange={setOutro}
            defaultCard={defaultTitleCard('outro')}
          />
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
