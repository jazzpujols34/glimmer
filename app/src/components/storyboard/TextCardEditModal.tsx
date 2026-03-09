'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { StoryboardTitleCard } from '@/types';
import { CardEditor } from './CardEditor';

interface TextCardEditModalProps {
  card: StoryboardTitleCard;
  onSave: (card: StoryboardTitleCard) => void;
  onClose: () => void;
}

export function TextCardEditModal({ card, onSave, onClose }: TextCardEditModalProps) {
  const [editCard, setEditCard] = useState<StoryboardTitleCard>(card);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">編輯文字卡</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <CardEditor card={editCard} onChange={setEditCard} />
        </div>
        <div className="flex gap-2 p-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button
            className="flex-1"
            onClick={() => onSave(editCard)}
            disabled={!editCard.text.trim()}
          >
            儲存
          </Button>
        </div>
      </div>
    </div>
  );
}
