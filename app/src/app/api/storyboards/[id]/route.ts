import { NextResponse } from 'next/server';
import {
  getStoryboard,
  updateStoryboard,
  deleteStoryboard,
  updateStoryboardSlot,
  updateStoryboardTransition,
  reorderStoryboardSlots,
  addSlotToStoryboard,
  removeSlotFromStoryboard,
} from '@/lib/storage';
import { captureError } from '@/lib/errors';
import type { StoryboardSlot, StoryboardTransitionType, StoryboardTitleCard, StoryboardMusic, StoryboardMusicTrack, StoryboardSubtitle } from '@/types';

export const runtime = 'edge';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/storyboards/[id] - Get a single storyboard
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const storyboard = await getStoryboard(id);

    if (!storyboard) {
      return NextResponse.json(
        { error: '找不到此故事板' },
        { status: 404 }
      );
    }

    return NextResponse.json({ storyboard });
  } catch (error) {
    captureError(error, { route: '/api/storyboards/[id]' });
    return NextResponse.json(
      { error: '無法取得故事板' },
      { status: 500 }
    );
  }
}

// PATCH /api/storyboards/[id] - Update a storyboard
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const storyboard = await getStoryboard(id);
    if (!storyboard) {
      return NextResponse.json(
        { error: '找不到此故事板' },
        { status: 404 }
      );
    }

    // Handle different update types
    const { action, ...data } = body;

    switch (action) {
      case 'updateSlot': {
        const { slotIndex, slot } = data as { slotIndex: number; slot: Partial<StoryboardSlot> };
        if (typeof slotIndex !== 'number') {
          return NextResponse.json({ error: '缺少 slotIndex' }, { status: 400 });
        }
        const updated = await updateStoryboardSlot(id, slotIndex, slot);
        if (!updated) {
          return NextResponse.json({ error: '更新格子失敗' }, { status: 400 });
        }
        return NextResponse.json({ storyboard: updated });
      }

      case 'updateTransition': {
        const { transitionIndex, transition } = data as {
          transitionIndex: number;
          transition: StoryboardTransitionType;
        };
        if (typeof transitionIndex !== 'number') {
          return NextResponse.json({ error: '缺少 transitionIndex' }, { status: 400 });
        }
        const validTransitions: StoryboardTransitionType[] = ['cut', 'crossfade-500', 'crossfade-1000'];
        if (!validTransitions.includes(transition)) {
          return NextResponse.json({ error: '無效的轉場效果' }, { status: 400 });
        }
        const updated = await updateStoryboardTransition(id, transitionIndex, transition);
        if (!updated) {
          return NextResponse.json({ error: '更新轉場失敗' }, { status: 400 });
        }
        return NextResponse.json({ storyboard: updated });
      }

      case 'reorderSlots': {
        const { fromIndex, toIndex } = data as { fromIndex: number; toIndex: number };
        if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') {
          return NextResponse.json({ error: '缺少 fromIndex 或 toIndex' }, { status: 400 });
        }
        const updated = await reorderStoryboardSlots(id, fromIndex, toIndex);
        if (!updated) {
          return NextResponse.json({ error: '重新排序失敗' }, { status: 400 });
        }
        return NextResponse.json({ storyboard: updated });
      }

      case 'addSlot': {
        const { position } = data as { position?: number };
        const storyboard = await getStoryboard(id);
        if (storyboard && storyboard.slots.length >= 30) {
          return NextResponse.json({ error: '最多 30 格' }, { status: 400 });
        }
        const updated = await addSlotToStoryboard(id, position);
        if (!updated) {
          return NextResponse.json({ error: '新增格子失敗' }, { status: 400 });
        }
        return NextResponse.json({ storyboard: updated });
      }

      case 'removeSlot': {
        const { slotIndex: removeIndex } = data as { slotIndex: number };
        if (typeof removeIndex !== 'number') {
          return NextResponse.json({ error: '缺少 slotIndex' }, { status: 400 });
        }
        const updated = await removeSlotFromStoryboard(id, removeIndex);
        if (!updated) {
          return NextResponse.json({ error: '刪除格子失敗（至少保留 2 格）' }, { status: 400 });
        }
        return NextResponse.json({ storyboard: updated });
      }

      case 'updateTitleCard': {
        const { titleCard } = data as { titleCard: StoryboardTitleCard | null };
        const updated = await updateStoryboard(id, { titleCard: titleCard || undefined });
        return NextResponse.json({ storyboard: updated });
      }

      case 'updateOutroCard': {
        const { outroCard } = data as { outroCard: StoryboardTitleCard | null };
        const updated = await updateStoryboard(id, { outroCard: outroCard || undefined });
        return NextResponse.json({ storyboard: updated });
      }

      case 'updateMusic': {
        const { music } = data as { music: StoryboardMusic | null };
        const updated = await updateStoryboard(id, { music: music || undefined });
        return NextResponse.json({ storyboard: updated });
      }

      case 'updateMusicTracks': {
        const { musicTracks } = data as { musicTracks: StoryboardMusicTrack[] };
        const updated = await updateStoryboard(id, {
          musicTracks: musicTracks.length > 0 ? musicTracks : undefined,
          music: undefined, // Clear legacy field
        });
        return NextResponse.json({ storyboard: updated });
      }

      case 'updateSubtitles': {
        const { subtitles } = data as { subtitles: StoryboardSubtitle[] };
        const updated = await updateStoryboard(id, {
          subtitles: subtitles.length > 0 ? subtitles : undefined,
        });
        return NextResponse.json({ storyboard: updated });
      }

      case 'fullUpdate': {
        // Full storyboard update for undo/redo sync
        const { storyboard: fullStoryboard } = data as { storyboard: typeof storyboard };
        if (!fullStoryboard) {
          return NextResponse.json({ error: '缺少 storyboard 資料' }, { status: 400 });
        }
        const updated = await updateStoryboard(id, {
          slots: fullStoryboard.slots,
          transitions: fullStoryboard.transitions,
          titleCard: fullStoryboard.titleCard,
          outroCard: fullStoryboard.outroCard,
          music: fullStoryboard.music,
          musicTracks: fullStoryboard.musicTracks,
          subtitles: fullStoryboard.subtitles,
          name: fullStoryboard.name,
        });
        return NextResponse.json({ storyboard: updated });
      }

      default: {
        // Generic update (name, etc.)
        const updates: Record<string, unknown> = {};
        if (data.name && typeof data.name === 'string') {
          updates.name = data.name.trim();
        }
        if (data.slots && Array.isArray(data.slots)) {
          updates.slots = data.slots;
        }
        if (data.transitions && Array.isArray(data.transitions)) {
          updates.transitions = data.transitions;
        }

        if (Object.keys(updates).length === 0) {
          return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
        }

        const updated = await updateStoryboard(id, updates);
        return NextResponse.json({ storyboard: updated });
      }
    }
  } catch (error) {
    captureError(error, { route: '/api/storyboards/[id]' });
    return NextResponse.json(
      { error: '更新故事板失敗' },
      { status: 500 }
    );
  }
}

// DELETE /api/storyboards/[id] - Delete a storyboard
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleted = await deleteStoryboard(id);

    if (!deleted) {
      return NextResponse.json(
        { error: '找不到此故事板' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, { route: '/api/storyboards/[id]' });
    return NextResponse.json(
      { error: '刪除故事板失敗' },
      { status: 500 }
    );
  }
}
