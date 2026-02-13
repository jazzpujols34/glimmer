'use client';

import { useState, useRef, useEffect } from 'react';
import type { StoryboardTransitionType } from '@/types';

interface TransitionPickerProps {
  value: StoryboardTransitionType;
  onChange: (transition: StoryboardTransitionType) => void;
}

const transitionOptions: { value: StoryboardTransitionType; label: string; labelEn: string }[] = [
  { value: 'cut', label: '直接切換', labelEn: 'Cut' },
  { value: 'crossfade-500', label: '淡入淡出 0.5s', labelEn: 'Fade 0.5s' },
  { value: 'crossfade-1000', label: '淡入淡出 1.0s', labelEn: 'Fade 1.0s' },
];

export function TransitionPicker({ value, onChange }: TransitionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const currentOption = transitionOptions.find((opt) => opt.value === value) || transitionOptions[0];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Transition Indicator Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-muted hover:bg-muted/80 border border-border transition-colors"
        title={currentOption.label}
      >
        {value === 'cut' ? (
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-20 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
          {transitionOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between ${
                value === option.value ? 'text-primary' : ''
              }`}
            >
              <span>{option.label}</span>
              {value === option.value && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
