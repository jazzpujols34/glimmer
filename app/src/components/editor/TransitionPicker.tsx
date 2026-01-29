'use client';

import type { Transition, TransitionType } from '@/types/editor';
import { cn } from '@/lib/utils';

interface TransitionPickerProps {
  transition: Transition;
  onChange: (transition: Transition) => void;
}

const TRANSITION_OPTIONS: { type: TransitionType; label: string }[] = [
  { type: 'none', label: '無' },
  { type: 'fade', label: '淡入淡出' },
  { type: 'crossfade', label: '交叉淡化' },
];

export function TransitionPicker({ transition, onChange }: TransitionPickerProps) {
  return (
    <div className="flex-shrink-0 flex items-center h-16">
      <button
        onClick={(e) => {
          e.stopPropagation();
          // Cycle through transition types
          const currentIdx = TRANSITION_OPTIONS.findIndex(o => o.type === transition.type);
          const nextIdx = (currentIdx + 1) % TRANSITION_OPTIONS.length;
          const next = TRANSITION_OPTIONS[nextIdx];
          onChange({ type: next.type, durationMs: transition.durationMs });
        }}
        className={cn(
          'w-8 h-8 rounded-full border flex items-center justify-center transition-colors text-xs',
          transition.type === 'none'
            ? 'border-dashed border-muted-foreground/40 text-muted-foreground/40 hover:border-muted-foreground'
            : 'border-primary bg-primary/10 text-primary'
        )}
        title={TRANSITION_OPTIONS.find(o => o.type === transition.type)?.label}
      >
        {transition.type === 'none' ? '·' : transition.type === 'fade' ? 'F' : 'X'}
      </button>
    </div>
  );
}
