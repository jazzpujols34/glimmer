'use client';

import { useState, useRef, useEffect } from 'react';
import type { Transition, TransitionType } from '@/types/editor';
import { TRANSITION_LABELS } from '@/types/editor';
import { cn } from '@/lib/utils';

interface TransitionPickerProps {
  transition: Transition;
  onChange: (transition: Transition) => void;
}

// Group transitions for better UX
const TRANSITION_GROUPS: { label: string; types: TransitionType[] }[] = [
  { label: '基本', types: ['none', 'fade', 'dissolve'] },
  { label: '淡場', types: ['fadeblack', 'fadewhite'] },
  { label: '擦除', types: ['wipeleft', 'wiperight', 'wipeup', 'wipedown'] },
  { label: '滑動', types: ['slideleft', 'slideright', 'slideup', 'slidedown'] },
];

// Short icons for the button
function getTransitionIcon(type: TransitionType): string {
  switch (type) {
    case 'none': return '·';
    case 'fade': return '◐';
    case 'fadeblack': return '◑';
    case 'fadewhite': return '◒';
    case 'dissolve': return '◊';
    case 'wipeleft': return '←';
    case 'wiperight': return '→';
    case 'wipeup': return '↑';
    case 'wipedown': return '↓';
    case 'slideleft': return '⇐';
    case 'slideright': return '⇒';
    case 'slideup': return '⇑';
    case 'slidedown': return '⇓';
    default: return '·';
  }
}

export function TransitionPicker({ transition, onChange }: TransitionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="flex-shrink-0 flex items-center h-16 relative" ref={containerRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={cn(
          'w-8 h-8 rounded-full border flex items-center justify-center transition-colors text-sm',
          transition.type === 'none'
            ? 'border-dashed border-muted-foreground/40 text-muted-foreground/40 hover:border-muted-foreground'
            : 'border-primary bg-primary/10 text-primary'
        )}
        title={TRANSITION_LABELS[transition.type]}
      >
        {getTransitionIcon(transition.type)}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-popover border rounded-lg shadow-lg p-2 min-w-[160px]">
          {TRANSITION_GROUPS.map((group) => (
            <div key={group.label} className="mb-2 last:mb-0">
              <div className="text-xs text-muted-foreground px-2 py-1">{group.label}</div>
              <div className="grid grid-cols-2 gap-1">
                {group.types.map((type) => (
                  <button
                    key={type}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange({ type, durationMs: transition.durationMs });
                      setIsOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors',
                      transition.type === type && 'bg-accent text-accent-foreground'
                    )}
                  >
                    <span className="w-4 text-center">{getTransitionIcon(type)}</span>
                    <span className="truncate">{TRANSITION_LABELS[type]}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Duration slider */}
          {transition.type !== 'none' && (
            <div className="border-t mt-2 pt-2">
              <div className="flex items-center justify-between px-2 text-xs text-muted-foreground mb-1">
                <span>時長</span>
                <span>{(transition.durationMs / 1000).toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min="300"
                max="1500"
                step="100"
                value={transition.durationMs}
                onChange={(e) => {
                  e.stopPropagation();
                  onChange({ type: transition.type, durationMs: Number(e.target.value) });
                }}
                className="w-full h-2 accent-primary"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
