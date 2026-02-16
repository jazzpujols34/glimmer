import { NextResponse } from 'next/server';
import { createStoryboard, getAllStoryboards } from '@/lib/storage';
import { captureError } from '@/lib/errors';
import type { AspectRatio } from '@/types';

export const runtime = 'edge';

// GET /api/storyboards - List all storyboards
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email') || undefined;

    const storyboards = await getAllStoryboards(email);
    return NextResponse.json({ storyboards });
  } catch (error) {
    captureError(error, { route: '/api/storyboards' });
    return NextResponse.json(
      { error: '無法取得故事板列表' },
      { status: 500 }
    );
  }
}

// POST /api/storyboards - Create a new storyboard
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, slotCount, aspectRatio, email } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: '請輸入故事板名稱' },
        { status: 400 }
      );
    }

    if (!slotCount || typeof slotCount !== 'number' || slotCount < 2 || slotCount > 30) {
      return NextResponse.json(
        { error: '格數必須在 2-30 之間' },
        { status: 400 }
      );
    }

    const validAspectRatios: AspectRatio[] = ['16:9', '9:16'];
    if (aspectRatio && !validAspectRatios.includes(aspectRatio)) {
      return NextResponse.json(
        { error: '無效的畫面比例' },
        { status: 400 }
      );
    }

    const storyboard = await createStoryboard(
      name.trim(),
      slotCount,
      aspectRatio || '16:9',
      email
    );

    return NextResponse.json({ storyboard }, { status: 201 });
  } catch (error) {
    captureError(error, { route: '/api/storyboards' });
    return NextResponse.json(
      { error: '建立故事板失敗' },
      { status: 500 }
    );
  }
}
