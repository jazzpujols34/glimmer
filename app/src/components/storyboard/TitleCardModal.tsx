'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { StoryboardTitleCard } from '@/types';
import { CardEditor } from './CardEditor';

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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">片頭 / 片尾設定</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <CardEditor
            label="片頭卡"
            card={intro}
            showToggle
            enabled={introEnabled}
            onToggle={setIntroEnabled}
            onChange={setIntro}
          />
          <div className="border-t border-border" />
          <CardEditor
            label="片尾卡"
            card={outro}
            showToggle
            enabled={outroEnabled}
            onToggle={setOutroEnabled}
            onChange={setOutro}
          />
        </div>
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
