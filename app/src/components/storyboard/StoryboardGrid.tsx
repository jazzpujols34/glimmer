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

interface StoryboardGridProps {
  storyboard: Storyboard;
  onUpdateSlot: (slotIndex: number, slot: Partial<StoryboardSlot>) => Promise<void>;
  onUpdateTransition: (transitionIndex: number, transition: StoryboardTransitionType) => Promise<void>;
  onReorderSlots: (fromIndex: number, toIndex: number) => Promise<void>;
  galleryJobs: GenerationJob[];
}

export function StoryboardGrid({
  storyboard,
  onUpdateSlot,
  onUpdateTransition,
  onReorderSlots,
  galleryJobs,
}: StoryboardGridProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Track blob URLs for cleanup to prevent memory leaks
  const blobUrlsRef = useRef<Map<number, string>>(new Map());

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, []);

  // Calculate remaining empty slots (text cards count as filled)
  const filledCount = storyboard.slots.filter((s) => s.status === 'filled' || s.status === 'text-card').length;
  const emptyCount = storyboard.slotCount - filledCount;
  const [editingTextCardIndex, setEditingTextCardIndex] = useState<number | null>(null);
  const [trimmingSlotIndex, setTrimmingSlotIndex] = useState<number | null>(null);

  const handleAddClick = (slotIndex: number) => {
    setActiveSlotIndex(slotIndex);
    setModalOpen(true);
  };

  const handleRemoveClick = async (slotIndex: number) => {
    // Revoke blob URL if exists to prevent memory leak
    const blobUrl = blobUrlsRef.current.get(slotIndex);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrlsRef.current.delete(slotIndex);
    }

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

      for (const file of files) {
        // Find next empty slot starting from activeSlotIndex
        while (currentSlotIndex < storyboard.slotCount) {
          if (storyboard.slots[currentSlotIndex].status === 'empty') {
            break;
          }
          currentSlotIndex++;
        }

        if (currentSlotIndex >= storyboard.slotCount) break;

        // Mark as uploading
        await onUpdateSlot(currentSlotIndex, {
          status: 'uploading',
          uploadProgress: 0,
        });

        try {
          // Revoke old blob URL if slot is being reused
          const oldBlobUrl = blobUrlsRef.current.get(currentSlotIndex);
          if (oldBlobUrl) {
            URL.revokeObjectURL(oldBlobUrl);
          }

          // Create blob URL for local preview
          const blobUrl = URL.createObjectURL(file);
          blobUrlsRef.current.set(currentSlotIndex, blobUrl);

          const duration = await getVideoDuration(blobUrl);

          // For now, store the blob URL directly (R2 upload can be added later)
          // In production, you would upload to R2 here and get back the R2 key
          const clip: StoryboardClip = {
            sourceType: 'upload',
            videoUrl: blobUrl,
            duration,
            fitMode: 'letterbox',
          };

          await onUpdateSlot(currentSlotIndex, {
            status: 'filled',
            clip,
            uploadProgress: undefined,
          });
        } catch (error) {
          logger.error('Error processing upload:', error);
          await onUpdateSlot(currentSlotIndex, {
            status: 'empty',
            uploadProgress: undefined,
          });
        }

        currentSlotIndex++;
      }
    },
    [activeSlotIndex, storyboard.slots, storyboard.slotCount, onUpdateSlot]
  );

  const handleAddFromGallery = useCallback(
    async (jobs: GenerationJob[], videoIndices: number[]): Promise<void> => {
      if (activeSlotIndex === null) return;

      let currentSlotIndex = activeSlotIndex;
      let addedCount = 0;

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const videoIndex = videoIndices[i];
        const videoUrls = job.videoUrls || (job.videoUrl ? [job.videoUrl] : []);
        const videoUrl = videoUrls[videoIndex];

        if (!videoUrl) continue;

        // Find next empty slot
        while (currentSlotIndex < storyboard.slotCount) {
          if (storyboard.slots[currentSlotIndex].status === 'empty') {
            break;
          }
          currentSlotIndex++;
        }

        if (currentSlotIndex >= storyboard.slotCount) break;

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
    [activeSlotIndex, storyboard.slots, storyboard.slotCount, onUpdateSlot]
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
      const slot = storyboard.slots[slotIndex];
      if (!slot?.clip) return;
      await onUpdateSlot(slotIndex, {
        clip: { ...slot.clip, trimStart, trimEnd },
      });
    },
    [storyboard.slots, onUpdateSlot]
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
    if (storyboard.slotCount <= 6) return 'grid-cols-3';
    if (storyboard.slotCount <= 12) return 'grid-cols-4';
    return 'grid-cols-5';
  };

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {filledCount} / {storyboard.slotCount} 格已填入
          </span>
          <span className="text-muted-foreground">
            約 {Math.round((storyboard.slots.reduce((acc, s) => {
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

      {/* Grid */}
      <div className={`grid ${getGridCols()} gap-4`}>
        {storyboard.slots.map((slot, index) => (
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
      </div>

      {/* Bulk Actions */}
      <div className="flex items-center gap-3 pt-4">
        <Button
          variant="outline"
          onClick={() => {
            // Find first empty slot
            const firstEmpty = storyboard.slots.findIndex((s) => s.status === 'empty');
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
