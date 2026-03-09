'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { StoryboardTitleCard, CardTextBox } from '@/types';
import { COLOR_PRESETS, CARD_BACKGROUNDS } from '@/lib/constants';
import { CARD_TEMPLATES, getCardTemplate } from '@/lib/card-templates';

// ── Constants ──────────────────────────────────────────────

const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FF4444', '#44AAFF',
  '#44DD44', '#FFD700', '#FF69B4', '#8B5CF6',
];

let _boxIdCounter = 0;
function newBoxId() {
  return `box_${Date.now()}_${++_boxIdCounter}`;
}

/** Create default text boxes from a card's text/subtitle fields */
function initTextBoxes(card: StoryboardTitleCard): CardTextBox[] {
  if (card.textBoxes?.length) return card.textBoxes;
  const boxes: CardTextBox[] = [];
  if (card.text) {
    boxes.push({
      id: 'title',
      text: card.text,
      x: 50, y: 42,
      fontSize: 8,
      color: card.textColor,
      bold: true,
    });
  }
  if (card.subtitle) {
    boxes.push({
      id: 'subtitle',
      text: card.subtitle,
      x: 50, y: 58,
      fontSize: 5,
      color: card.textColor,
      bold: false,
    });
  }
  // Always at least one box
  if (boxes.length === 0) {
    boxes.push({
      id: 'title',
      text: '標題',
      x: 50, y: 45,
      fontSize: 8,
      color: card.textColor,
      bold: true,
    });
  }
  return boxes;
}

/** Sync textBoxes back to text/subtitle for backward compat */
function syncCardFields(card: StoryboardTitleCard, boxes: CardTextBox[]): StoryboardTitleCard {
  return {
    ...card,
    text: boxes[0]?.text || '',
    subtitle: boxes[1]?.text || '',
    textBoxes: boxes,
  };
}

// ── Exports ────────────────────────────────────────────────

export interface CardEditorProps {
  label?: string;
  card: StoryboardTitleCard;
  onChange: (card: StoryboardTitleCard) => void;
  showToggle?: boolean;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
}

/** Read-only card preview — renders textBoxes if present, else falls back to template */
export function CardPreview({
  card,
  className = '',
}: {
  card: StoryboardTitleCard;
  className?: string;
}) {
  const bgImageUrl = card.backgroundImage ? `/backgrounds/${card.backgroundImage}` : null;

  // Text boxes mode
  if (card.textBoxes?.length) {
    return (
      <div
        className={`relative overflow-hidden ${className}`}
        style={{
          backgroundColor: card.backgroundColor,
          ...(bgImageUrl ? {
            backgroundImage: `url(${bgImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : {}),
        }}
      >
        {bgImageUrl && <div className="absolute inset-0 bg-black/20" />}
        {card.textBoxes.map((box) => (
          <div
            key={box.id}
            className="absolute whitespace-nowrap"
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${box.fontSize}cqh`,
              color: box.color,
              fontWeight: box.bold ? 700 : 400,
              textShadow: bgImageUrl ? '0 1px 4px rgba(0,0,0,0.5)' : undefined,
              zIndex: 1,
            }}
          >
            {box.text || ' '}
          </div>
        ))}
      </div>
    );
  }

  // Legacy template mode
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
      style={{
        backgroundColor: card.backgroundColor,
        ...(bgImageUrl ? {
          backgroundImage: `url(${bgImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {}),
      }}
    >
      {bgImageUrl && <div className="absolute inset-0 bg-black/20" />}
      <div className={`absolute inset-0 ${template.preview.container}`} style={{ zIndex: 1 }}>
        <span
          className={template.preview.title}
          style={{
            color: card.textColor,
            ...(bgImageUrl ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : {}),
          }}
        >
          {card.text || '(無標題)'}
        </span>
        {renderDivider()}
        {card.subtitle && (
          <span
            className={template.preview.subtitle}
            style={{
              color: card.textColor,
              ...(bgImageUrl ? { textShadow: '0 1px 3px rgba(0,0,0,0.5)' } : {}),
            }}
          >
            {card.subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Interactive Canvas ─────────────────────────────────────

function InteractiveCanvas({
  card,
  textBoxes,
  selectedId,
  onSelect,
  onDeselect,
  onMoveBox,
  canvasRef,
}: {
  card: StoryboardTitleCard;
  textBoxes: CardTextBox[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onMoveBox: (id: string, x: number, y: number) => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}) {
  const draggingRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ px: number; py: number; boxX: number; boxY: number } | null>(null);
  const bgImageUrl = card.backgroundImage ? `/backgrounds/${card.backgroundImage}` : null;

  const handlePointerDown = useCallback((e: React.PointerEvent, boxId: string) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const box = textBoxes.find(b => b.id === boxId);
    if (!box) return;
    onSelect(boxId);
    draggingRef.current = boxId;
    dragStartRef.current = { px: e.clientX, py: e.clientY, boxX: box.x, boxY: box.y };
  }, [textBoxes, onSelect]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !dragStartRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStartRef.current.px) / rect.width) * 100;
    const dy = ((e.clientY - dragStartRef.current.py) / rect.height) * 100;
    const newX = Math.max(5, Math.min(95, dragStartRef.current.boxX + dx));
    const newY = Math.max(5, Math.min(95, dragStartRef.current.boxY + dy));
    onMoveBox(draggingRef.current, newX, newY);
  }, [canvasRef, onMoveBox]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
    dragStartRef.current = null;
  }, []);

  return (
    <div
      ref={canvasRef}
      className="relative w-full aspect-video rounded-lg overflow-hidden select-none"
      style={{
        containerType: 'size',
        backgroundColor: card.backgroundColor,
        ...(bgImageUrl ? {
          backgroundImage: `url(${bgImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {}),
        touchAction: 'none',
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerDown={(e) => {
        // Click on canvas background = deselect
        if (e.target === e.currentTarget) onDeselect();
      }}
    >
      {bgImageUrl && <div className="absolute inset-0 bg-black/20" />}

      {textBoxes.map((box) => {
        const isSelected = box.id === selectedId;
        return (
          <div
            key={box.id}
            className={`absolute cursor-grab active:cursor-grabbing whitespace-nowrap px-2 py-0.5 rounded transition-shadow ${
              isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-transparent' : ''
            }`}
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${box.fontSize}cqh`,
              color: box.color,
              fontWeight: box.bold ? 700 : 400,
              textShadow: bgImageUrl ? '0 1px 4px rgba(0,0,0,0.5)' : '0 1px 2px rgba(0,0,0,0.3)',
              zIndex: isSelected ? 10 : 1,
            }}
            onPointerDown={(e) => handlePointerDown(e, box.id)}
          >
            {box.text || '(空白)'}
          </div>
        );
      })}
    </div>
  );
}

// ── Text Box Toolbar ───────────────────────────────────────

function BoxToolbar({
  box,
  onChange,
  onDelete,
}: {
  box: CardTextBox;
  onChange: (updates: Partial<CardTextBox>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg bg-muted/50 p-3">
      {/* Text input */}
      <input
        type="text"
        value={box.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="輸入文字"
        className="w-full px-3 py-2 bg-background rounded-md text-sm border border-border"
        autoFocus
      />

      <div className="flex items-center gap-3 flex-wrap">
        {/* Font size stepper */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange({ fontSize: Math.max(3, box.fontSize - 1) })}
            className="w-8 h-8 rounded bg-background border border-border flex items-center justify-center text-sm hover:bg-muted"
          >
            A<span className="text-[10px]">-</span>
          </button>
          <span className="text-xs text-muted-foreground w-6 text-center">{box.fontSize}</span>
          <button
            type="button"
            onClick={() => onChange({ fontSize: Math.min(20, box.fontSize + 1) })}
            className="w-8 h-8 rounded bg-background border border-border flex items-center justify-center text-sm hover:bg-muted"
          >
            A<span className="text-[10px]">+</span>
          </button>
        </div>

        {/* Bold toggle */}
        <button
          type="button"
          onClick={() => onChange({ bold: !box.bold })}
          className={`w-8 h-8 rounded border flex items-center justify-center text-sm font-bold transition-colors ${
            box.bold
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background border-border hover:bg-muted'
          }`}
        >
          B
        </button>

        {/* Color swatches */}
        <div className="flex gap-1.5">
          {TEXT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange({ color })}
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                box.color === color
                  ? 'border-primary ring-2 ring-primary/30 scale-110'
                  : 'border-border/50 hover:scale-110'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        {/* Delete box */}
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto w-8 h-8 rounded bg-background border border-destructive/50 flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
          title="刪除文字"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main CardEditor ────────────────────────────────────────

export function CardEditor({ label, card, onChange, showToggle, enabled = true, onToggle }: CardEditorProps) {
  const hasBackgrounds = CARD_BACKGROUNDS.length > 0;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Initialize text boxes from card data
  const [textBoxes, setTextBoxes] = useState<CardTextBox[]>(() => initTextBoxes(card));

  // Keep textBoxes in sync if card prop changes externally (e.g., parent reset)
  const cardTextRef = useRef(card.text);
  useEffect(() => {
    if (card.text !== cardTextRef.current && !card.textBoxes) {
      setTextBoxes(initTextBoxes(card));
      cardTextRef.current = card.text;
    }
  }, [card]);

  const emitChange = useCallback((boxes: CardTextBox[], extraFields?: Partial<StoryboardTitleCard>) => {
    setTextBoxes(boxes);
    onChange(syncCardFields({ ...card, ...extraFields }, boxes));
  }, [card, onChange]);

  const updateBox = useCallback((id: string, updates: Partial<CardTextBox>) => {
    const next = textBoxes.map(b => b.id === id ? { ...b, ...updates } : b);
    emitChange(next);
  }, [textBoxes, emitChange]);

  const moveBox = useCallback((id: string, x: number, y: number) => {
    const next = textBoxes.map(b => b.id === id ? { ...b, x, y } : b);
    // Update local state directly for smooth drag, emit to parent
    setTextBoxes(next);
    onChange(syncCardFields(card, next));
  }, [textBoxes, card, onChange]);

  const addBox = useCallback(() => {
    const newBox: CardTextBox = {
      id: newBoxId(),
      text: '新文字',
      x: 50,
      y: 50 + textBoxes.length * 12,
      fontSize: 6,
      color: card.textColor,
      bold: false,
    };
    const next = [...textBoxes, newBox];
    setSelectedId(newBox.id);
    emitChange(next);
  }, [textBoxes, card.textColor, emitChange]);

  const deleteBox = useCallback((id: string) => {
    const next = textBoxes.filter(b => b.id !== id);
    if (next.length === 0) return; // Keep at least one box
    setSelectedId(null);
    emitChange(next);
  }, [textBoxes, emitChange]);

  const selectedBox = textBoxes.find(b => b.id === selectedId) || null;

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
          {/* Interactive canvas */}
          <div className="relative group">
            <InteractiveCanvas
              card={card}
              textBoxes={textBoxes}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDeselect={() => setSelectedId(null)}
              onMoveBox={moveBox}
              canvasRef={canvasRef}
            />
            {/* Fullscreen button */}
            <button
              type="button"
              onClick={() => setFullscreenPreview(true)}
              className="absolute top-2 right-2 w-7 h-7 rounded bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
              title="全螢幕預覽"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>

          {/* Fullscreen preview modal */}
          {fullscreenPreview && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer"
              onClick={() => setFullscreenPreview(false)}
            >
              <button
                type="button"
                onClick={() => setFullscreenPreview(false)}
                className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <div className="w-[90vw] max-w-3xl" onClick={(e) => e.stopPropagation()}>
                <CardPreview
                  card={syncCardFields(card, textBoxes)}
                  className="aspect-video w-full rounded-xl"
                />
              </div>
            </div>
          )}

          {/* Selected box toolbar */}
          {selectedBox && (
            <BoxToolbar
              box={selectedBox}
              onChange={(updates) => updateBox(selectedBox.id, updates)}
              onDelete={() => deleteBox(selectedBox.id)}
            />
          )}

          {/* Add text box */}
          <button
            type="button"
            onClick={addBox}
            className="w-full py-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增文字
          </button>

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
              onChange={(e) => emitChange(textBoxes, { durationSeconds: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* Background: color presets + images */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">背景</label>

            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    emitChange(textBoxes, {
                      backgroundColor: preset.bg,
                      textColor: preset.text,
                      backgroundImage: undefined,
                    })
                  }
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    !card.backgroundImage && card.backgroundColor === preset.bg
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-transparent hover:border-muted-foreground/50'
                  }`}
                  style={{ backgroundColor: preset.bg }}
                  title={preset.label}
                />
              ))}
            </div>

            {hasBackgrounds && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {CARD_BACKGROUNDS.map((bg) => (
                  <button
                    key={bg.filename}
                    type="button"
                    onClick={() =>
                      emitChange(textBoxes, {
                        backgroundImage: bg.filename,
                        textColor: bg.textColor,
                      })
                    }
                    className={`aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                      card.backgroundImage === bg.filename
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-transparent hover:border-muted-foreground/50'
                    }`}
                  >
                    <img
                      src={`/backgrounds/${bg.filename}`}
                      alt={bg.label}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Layout template picker — repositions text boxes */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">快速排版</label>
            <div className="grid grid-cols-3 gap-3">
              {CARD_TEMPLATES.map((template) => {
                const isSelected = (card.templateId || 'classic-center') === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      const positions = TEMPLATE_POSITIONS[template.id] || TEMPLATE_POSITIONS['classic-center'];
                      const next = textBoxes.map((box, i) => {
                        const pos = i === 0 ? positions.title : positions.subtitle;
                        return { ...box, x: pos.x, y: pos.y, fontSize: pos.fontSize, bold: pos.bold };
                      });
                      emitChange(next, { templateId: template.id });
                    }}
                    className={`rounded-lg border-2 overflow-hidden transition-all ${
                      isSelected
                        ? 'border-primary ring-1 ring-primary/30'
                        : 'border-border/50 hover:border-muted-foreground/50'
                    }`}
                  >
                    <CardPreview
                      card={{
                        ...card,
                        text: '標題',
                        subtitle: '副標題',
                        templateId: template.id,
                        textBoxes: undefined, // force template rendering for thumbnails
                      }}
                      className="h-16"
                    />
                    <div className={`px-2 py-1 text-[11px] text-center truncate transition-colors ${
                      isSelected ? 'bg-primary/10 text-primary font-medium' : 'bg-muted/50 text-muted-foreground'
                    }`}>
                      {template.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Template → text box position mapping
const TEMPLATE_POSITIONS: Record<string, {
  title: { x: number; y: number; fontSize: number; bold: boolean };
  subtitle: { x: number; y: number; fontSize: number; bold: boolean };
}> = {
  'classic-center': {
    title:    { x: 50, y: 42, fontSize: 8, bold: true },
    subtitle: { x: 50, y: 60, fontSize: 5, bold: false },
  },
  'lower-third': {
    title:    { x: 15, y: 72, fontSize: 7, bold: true },
    subtitle: { x: 15, y: 85, fontSize: 4, bold: false },
  },
  'top-title': {
    title:    { x: 50, y: 20, fontSize: 7, bold: true },
    subtitle: { x: 50, y: 35, fontSize: 4, bold: false },
  },
  'elegant-stack': {
    title:    { x: 50, y: 40, fontSize: 10, bold: false },
    subtitle: { x: 50, y: 62, fontSize: 4, bold: false },
  },
  'date-stamp': {
    title:    { x: 50, y: 42, fontSize: 8, bold: true },
    subtitle: { x: 50, y: 60, fontSize: 3, bold: false },
  },
  'minimal': {
    title:    { x: 50, y: 45, fontSize: 6, bold: false },
    subtitle: { x: 50, y: 62, fontSize: 3, bold: false },
  },
};

export function defaultTextCard(): StoryboardTitleCard {
  return {
    text: '',
    subtitle: '',
    durationSeconds: 3,
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
  };
}
