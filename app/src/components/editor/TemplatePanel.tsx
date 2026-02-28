'use client';

import { useState } from 'react';
import { useEditor, useEditorDispatch } from './EditorContext';
import { Button } from '@/components/ui/button';
import {
  QUICK_TEMPLATES,
  getTemplatesByOccasion,
  buildEditorTitleCard,
  buildEditorOutroCard,
  buildEditorTransitions,
  buildSuggestedMusic,
} from '@/lib/templates';
import type { QuickTemplate } from '@/lib/templates';
import type { OccasionType } from '@/types';
import { Check, Wand2, Music, Type, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const OCCASION_LABELS: Record<OccasionType, string> = {
  memorial: '追思',
  birthday: '生日',
  wedding: '婚禮',
  pet: '寵物',
  other: '其他',
};

interface TemplateCardProps {
  template: QuickTemplate;
  isSelected: boolean;
  onSelect: () => void;
}

function TemplateCard({ template, isSelected, onSelect }: TemplateCardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative w-full p-3 rounded-lg border text-left transition-all',
        isSelected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border hover:border-muted-foreground/50'
      )}
    >
      {/* Color preview bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1.5 rounded-t-lg"
        style={{ backgroundColor: template.previewColor }}
      />

      <div className="mt-1">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{template.name}</span>
          {isSelected && <Check className="w-4 h-4 text-primary" />}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>

        {/* Preview of what it includes */}
        <div className="flex gap-2 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Type className="w-3 h-3" /> 標題
          </span>
          <span className="flex items-center gap-0.5">
            <Music className="w-3 h-3" /> {template.music.name}
          </span>
          <span className="flex items-center gap-0.5">
            <ArrowRightLeft className="w-3 h-3" />
            {template.transition === 'cut' ? '無' : '淡入淡出'}
          </span>
        </div>
      </div>
    </button>
  );
}

export function TemplatePanel() {
  const state = useEditor();
  const dispatch = useEditorDispatch();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [filterOccasion, setFilterOccasion] = useState<OccasionType | 'all'>('all');
  const [showConfirm, setShowConfirm] = useState(false);
  const [inputs, setInputs] = useState({ name: '', date: '', message: '' });

  const filteredTemplates = filterOccasion === 'all'
    ? QUICK_TEMPLATES
    : getTemplatesByOccasion(filterOccasion);

  const handleApplyTemplate = () => {
    if (!selectedTemplate) return;

    const template = QUICK_TEMPLATES.find(t => t.id === selectedTemplate);
    if (!template) return;

    // Build title card
    const titleCard = buildEditorTitleCard(template, inputs);
    dispatch({ type: 'SET_TITLE_CARD', payload: titleCard });

    // Build outro card
    const outroCard = buildEditorOutroCard(template, inputs);
    dispatch({ type: 'SET_OUTRO_CARD', payload: outroCard });

    // Build transitions for all clips
    if (state.clips.length > 1) {
      const transitions = buildEditorTransitions(template, state.clips.length);
      transitions.forEach((transition, index) => {
        dispatch({ type: 'SET_TRANSITION', payload: { index, transition } });
      });
    }

    // Note: Music is suggested but not auto-added (user might already have music)
    setShowConfirm(false);
  };

  const template = selectedTemplate
    ? QUICK_TEMPLATES.find(t => t.id === selectedTemplate)
    : null;

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">範本</h3>
        <Wand2 className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Occasion filter */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setFilterOccasion('all')}
          className={cn(
            'px-2 py-1 text-xs rounded-md transition-colors',
            filterOccasion === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80'
          )}
        >
          全部
        </button>
        {(Object.keys(OCCASION_LABELS) as OccasionType[]).map((occasion) => (
          <button
            key={occasion}
            onClick={() => setFilterOccasion(occasion)}
            className={cn(
              'px-2 py-1 text-xs rounded-md transition-colors',
              filterOccasion === occasion
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            )}
          >
            {OCCASION_LABELS[occasion]}
          </button>
        ))}
      </div>

      {/* Template list */}
      <div className="space-y-2">
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedTemplate === template.id}
            onSelect={() => {
              setSelectedTemplate(template.id);
              setShowConfirm(true);
            }}
          />
        ))}
      </div>

      {/* Apply confirmation */}
      {showConfirm && template && (
        <div className="border-t pt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            套用「{template.name}」範本將設定標題卡片、結尾卡片、和片段間的轉場效果。
          </p>

          {/* User inputs for placeholders */}
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground">名稱</label>
              <input
                type="text"
                value={inputs.name}
                onChange={(e) => setInputs({ ...inputs, name: e.target.value })}
                placeholder="例如: 王小明"
                className="w-full mt-1 px-2 py-1.5 text-sm border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">日期 (選填)</label>
              <input
                type="text"
                value={inputs.date}
                onChange={(e) => setInputs({ ...inputs, date: e.target.value })}
                placeholder="例如: 1950-2024"
                className="w-full mt-1 px-2 py-1.5 text-sm border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">訊息 (選填)</label>
              <input
                type="text"
                value={inputs.message}
                onChange={(e) => setInputs({ ...inputs, message: e.target.value })}
                placeholder="例如: 永遠懷念您"
                className="w-full mt-1 px-2 py-1.5 text-sm border rounded-md bg-background"
              />
            </div>
          </div>

          {/* Preview cards */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div
              className="p-2 rounded text-center"
              style={{
                backgroundColor: template.titleCard.backgroundColor,
                color: template.titleCard.textColor,
              }}
            >
              <div className="font-medium">
                {template.titleCard.textTemplate.replace('{name}', inputs.name || '名稱')}
              </div>
              {template.titleCard.subtitleTemplate && (
                <div className="opacity-80">
                  {template.titleCard.subtitleTemplate.replace('{date}', inputs.date || '日期')}
                </div>
              )}
            </div>
            <div
              className="p-2 rounded text-center"
              style={{
                backgroundColor: template.outroCard.backgroundColor,
                color: template.outroCard.textColor,
              }}
            >
              <div className="font-medium">
                {template.outroCard.textTemplate
                  .replace('{name}', inputs.name || '')
                  .replace('{message}', inputs.message || '結尾訊息')}
              </div>
            </div>
          </div>

          {/* Suggested music hint */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs">
            <Music className="w-4 h-4 text-muted-foreground" />
            <span>建議配樂: {template.music.name}</span>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                setShowConfirm(false);
                setSelectedTemplate(null);
              }}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={handleApplyTemplate}
              disabled={!inputs.name}
            >
              套用範本
            </Button>
          </div>
        </div>
      )}

      {/* Help text when nothing selected */}
      {!showConfirm && (
        <p className="text-xs text-muted-foreground">
          選擇範本可快速設定標題、轉場和配樂風格。{state.clips.length === 0 && '請先新增影片片段。'}
        </p>
      )}
    </div>
  );
}
