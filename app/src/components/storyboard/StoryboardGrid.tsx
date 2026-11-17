'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SlotCard } from './SlotCard';
import { TransitionPicker } from './TransitionPicker';
import { AddToSlotModal } from './AddToSlotModal';
import { TextCardEditModal } from './TextCardEditModal';
import { TrimModal } from './TrimModal';
import { Button } from '@/components/ui/button';
import type { Storyboard, StoryboardSlot, StoryboardTransitionType, GenerationJob, StoryboardClip, StoryboardTitleCard } from '@/types';
import { logger } from '@/lib/logger';
import { getVideoDuration as _getVideoDuration } from '@/lib/media-utils';
import { buildUploadedClip, getDisplaySlot } from '@/lib/storyboard-upload';

interface StoryboardGridProps {
  storyboard: Storyboard;
  onUpdateSlot: (slotIndex: number, slot: Partial<StoryboardSlot>) => Promise<void>;
  onUpdateTransition: (transitionIndex: number, transition: StoryboardTransitionType) => Promise<void>;
  onReorderSlots: (fromIndex: number, toIndex: number) => Promise<void>;
  onAddSlot?: (position?: number) => Promise<void>;
  onRemoveSlot?: (slotIndex: number) => Promise<void>;
  galleryJobs: GenerationJob[];
}

export function StoryboardGrid({
  storyboard,
  onUpdateSlot,
  onUpdateTransition,
  onReorderSlots,
  onAddSlot,
  onRemoveSlot,
  galleryJobs,
}: StoryboardGridProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Ref to latest storyboard so useCallback deps don't include storyboard.slots
  // (which is a new array ref every render, defeating SlotCard React.memo)
  const storyboardRef = useRef(storyboard);
  useEffect(() => {
    storyboardRef.current = storyboard;
  });

  // Upload state lives only in this tab; it is never saved to the server
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadingIdsRef = useRef<Set<string>>(new Set());
  const displaySlots = storyboard.slots.map((s) => getDisplaySlot(s, uploadingIds));

  // Calculate remaining empty slots (text cards count as filled)
  const filledCount = displaySlots.filter((s) => s.status === 'filled' || s.status === 'text-card').length;
  const emptyCount = storyboard.slots.length - filledCount;
  const [editingTextCardIndex, setEditingTextCardIndex] = useState<number | null>(null);
  const [trimmingSlotIndex, setTrimmingSlotIndex] = useState<number | null>(null);

  const handleAddClick = (slotIndex: number) => {
    setActiveSlotIndex(slotIndex);
    setModalOpen(true);
  };

  const handleRemoveClick = async (slotIndex: number) => {
    await onUpdateSlot(slotIndex, {
      status: 'empty',
      clip: undefined,
      textCard: undefined,
      uploadProgress: undefined,
    });
  };

  const getVideoDuration = (url: string) => _getVideoDuration(url).catch(() => 5);

  const handleAddFromUpload = useCallback(
    async (files: File[]) => {
      if (activeSlotIndex === null) return;

      let currentSlotIndex = activeSlotIndex;
      const { slots, slotCount, id: storyboardId } = storyboardRef.current;
      setUploadError(null);

      for (const file of files) {
        // Find next empty slot (legacy server-side "uploading" counts as empty)
        while (currentSlotIndex < slotCount) {
          if (getDisplaySlot(slots[currentSlotIndex], uploadingIdsRef.current).status === 'empty') {
            break;
          }
          currentSlotIndex++;
        }

        if (currentSlotIndex >= slotCount) break;

        const slotId = slots[currentSlotIndex].id;
        uploadingIdsRef.current = new Set(uploadingIdsRef.current).add(slotId);
        setUploadingIds(uploadingIdsRef.current);

        const blobUrl = URL.createObjectURL(file);
        try {
          const duration = await getVideoDuration(blobUrl);

          const formData = new FormData();
          formData.append('file', file);
          formData.append('jobId', storyboardId);
          const res = await fetch('/api/upload-clip', { method: 'POST', body: formData });
          const data: { r2Key?: string; error?: string } = await res.json().catch(() => ({}));
          if (!res.ok || !data.r2Key) {
            throw new Error(data.error || `HTTP ${res.status}`);
          }

          await onUpdateSlot(currentSlotIndex, {
            status: 'filled',
            clip: buildUploadedClip(data.r2Key, duration),
            uploadProgress: undefined,
          });
        } catch (error) {
          logger.error('Error uploading clip:', error);
          setUploadError(`「${file.name}」上傳失敗，請重試。`);
        } finally {
          URL.revokeObjectURL(blobUrl);
          const next = new Set(uploadingIdsRef.current);
          next.delete(slotId);
          uploadingIdsRef.current = next;
          setUploadingIds(next);
        }

        currentSlotIndex++;
      }
    },
    [activeSlotIndex, onUpdateSlot]
  );

  const handleAddFromGallery = useCallback(
    async (jobs: GenerationJob[], videoIndices: number[]): Promise<void> => {
      if (activeSlotIndex === null) return;

      let currentSlotIndex = activeSlotIndex;
      let addedCount = 0;
      const { slots, slotCount } = storyboardRef.current;

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const videoIndex = videoIndices[i];
        const videoUrls = job.videoUrls || (job.videoUrl ? [job.videoUrl] : []);
        const videoUrl = videoUrls[videoIndex];

        if (!videoUrl) continue;

        // Find next empty slot
        while (currentSlotIndex < slotCount) {
          if (slots[currentSlotIndex].status === 'empty') {
            break;
          }
          currentSlotIndex++;
        }

        if (currentSlotIndex >= slotCount) break;

        // This will throw if it fails, propagating error to caller
        const duration = await getVideoDuration(videoUrl);

        const clip: StoryboardClip = {
          sourceType: 'gallery',
          jobId: job.id,
          videoUrl,
          duration,
          originalAspectRatio: job.settings?.aspectRatio,
          fitMode: 'letterbox',
        };

        await onUpdateSlot(currentSlotIndex, {
          status: 'filled',
          clip,
        });

        addedCount++;
        currentSlotIndex++;
      }

      if (addedCount === 0 && jobs.length > 0) {
        throw new Error('無法新增任何影片');
      }
    },
    [activeSlotIndex, onUpdateSlot]
  );

  const handleAddTextCard = useCallback(
    async (card: StoryboardTitleCard) => {
      if (activeSlotIndex === null) return;
      await onUpdateSlot(activeSlotIndex, {
        status: 'text-card',
        textCard: card,
        clip: undefined,
      });
    },
    [activeSlotIndex, onUpdateSlot]
  );

  const handleEditTextCard = useCallback(
    async (slotIndex: number, card: StoryboardTitleCard) => {
      await onUpdateSlot(slotIndex, { textCard: card });
    },
    [onUpdateSlot]
  );

  const handleTrimSave = useCallback(
    async (slotIndex: number, trimStart: number, trimEnd: number) => {
      const slot = storyboardRef.current.slots[slotIndex];
      if (!slot?.clip) return;
      await onUpdateSlot(slotIndex, {
        clip: { ...slot.clip, trimStart, trimEnd },
      });
    },
    [onUpdateSlot]
  );

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
  };

  const handleDrop = async (index: number) => {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      return;
    }

    await onReorderSlots(draggedIndex, index);
    setDraggedIndex(null);
  };

  // Calculate grid columns based on slot count
  const getGridCols = () => {
    const count = storyboard.slots.length;
    if (count <= 6) return 'grid-cols-3';
    if (count <= 12) return 'grid-cols-4';
    return 'grid-cols-5';
  };

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {filledCount} / {storyboard.slots.length} 格已填入
          </span>
          <span className="text-muted-foreground">
            約 {Math.round((displaySlots.reduce((acc, s) => {
              if (s.clip) return acc + ((s.clip.trimEnd ?? s.clip.duration) - (s.clip.trimStart ?? 0));
              if (s.textCard) return acc + s.textCard.durationSeconds;
              return acc;
            }, 0)) * 10) / 10}s
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-muted rounded text-xs">
            {storyboard.aspectRatio}
          </span>
        </div>
      </div>

      {uploadError && (
        <p role="alert" className="text-sm text-destructive">{uploadError}</p>
      )}

      {/* Grid */}
      <div className={`grid ${getGridCols()} gap-4`}>
        {displaySlots.map((slot, index) => (
          <div key={slot.id} className="relative">
            {/* Slot Card */}
            <div
              draggable={slot.status === 'filled' || slot.status === 'text-card'}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={() => setDraggedIndex(null)}
              onClick={() => {
                if (slot.status === 'text-card') setEditingTextCardIndex(index);
              }}
            >
              <SlotCard
                slot={slot}
                targetAspectRatio={storyboard.aspectRatio}
                onAddClick={() => handleAddClick(index)}
                onRemoveClick={() => handleRemoveClick(index)}
                onRemoveSlot={onRemoveSlot && storyboard.slots.length > 2 ? () => onRemoveSlot(index) : undefined}
                onEditTextCard={slot.status === 'text-card' ? () => setEditingTextCardIndex(index) : undefined}
                onTrimClick={slot.status === 'filled' && slot.clip ? () => setTrimmingSlotIndex(index) : undefined}
                isDragging={draggedIndex === index}
              />
            </div>

            {/* Transition Picker (between slots) */}
            {index < storyboard.slots.length - 1 && (
              <div className="absolute -right-6 top-1/2 -translate-y-1/2 z-10">
                <TransitionPicker
                  value={storyboard.transitions[index]}
                  onChange={(transition) => onUpdateTransition(index, transition)}
                />
              </div>
            )}
          </div>
        ))}

        {/* Add Slot Card */}
        {onAddSlot && storyboard.slots.length < 30 && (
          <button
            onClick={() => onAddSlot()}
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border/50 rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-colors min-h-[120px]"
          >
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-xs text-muted-foreground">新增格子</span>
          </button>
        )}
      </div>

      {/* Bulk Actions */}
      <div className="flex items-center gap-3 pt-4">
        <Button
          variant="outline"
          onClick={() => {
            // Find first empty slot
            const firstEmpty = displaySlots.findIndex((s) => s.status === 'empty');
            if (firstEmpty >= 0) {
              handleAddClick(firstEmpty);
            }
          }}
          disabled={emptyCount === 0}
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          批次上傳
        </Button>
      </div>

      {/* Add to Slot Modal */}
      <AddToSlotModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setActiveSlotIndex(null);
        }}
        onAddFromUpload={handleAddFromUpload}
        onAddFromGallery={handleAddFromGallery}
        onAddTextCard={handleAddTextCard}
        galleryJobs={galleryJobs}
        slotIndex={activeSlotIndex ?? 0}
        remainingSlots={emptyCount}
      />
      {/* Text Card Edit Modal */}
      {editingTextCardIndex !== null && storyboard.slots[editingTextCardIndex]?.textCard && (
        <TextCardEditModal
          card={storyboard.slots[editingTextCardIndex].textCard!}
          onSave={(card) => {
            handleEditTextCard(editingTextCardIndex, card);
            setEditingTextCardIndex(null);
          }}
          onClose={() => setEditingTextCardIndex(null)}
        />
      )}
      {trimmingSlotIndex !== null && storyboard.slots[trimmingSlotIndex]?.clip && (
        <TrimModal
          videoUrl={storyboard.slots[trimmingSlotIndex].clip!.videoUrl}
          duration={storyboard.slots[trimmingSlotIndex].clip!.duration}
          trimStart={storyboard.slots[trimmingSlotIndex].clip!.trimStart ?? 0}
          trimEnd={storyboard.slots[trimmingSlotIndex].clip!.trimEnd ?? storyboard.slots[trimmingSlotIndex].clip!.duration}
          onSave={(trimStart, trimEnd) => {
            handleTrimSave(trimmingSlotIndex, trimStart, trimEnd);
            setTrimmingSlotIndex(null);
          }}
          onClose={() => setTrimmingSlotIndex(null)}
        />
      )}
    </div>
  );
}
