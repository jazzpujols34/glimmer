import { NextResponse } from 'next/server';
import { createStoryboard, getAllStoryboards } from '@/lib/storage';
import { captureError } from '@/lib/errors';
import { errors } from '@/lib/api-response';
import { getRequesterEmail } from '@/lib/owner';
import { isAdmin } from '@/lib/credits';
import type { AspectRatio } from '@/types';

export const runtime = 'edge';

function requireRequesterEmail(request: Request) {
  const requesterEmail = getRequesterEmail(request);
  if (!requesterEmail) {
    return new URL(request.url).searchParams.get('email')
      ? errors.invalidEmail()
      : errors.missingField('email');
  }
  return requesterEmail;
}

// GET /api/storyboards - List all storyboards
export async function GET(request: Request) {
  try {
    const requesterEmail = requireRequesterEmail(request);
    if (typeof requesterEmail !== 'string') return requesterEmail;

    // Admins see every storyboard; everyone else only sees their own
    const storyboards = await getAllStoryboards(isAdmin(requesterEmail) ? undefined : requesterEmail);
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
    const requesterEmail = requireRequesterEmail(request);
    if (typeof requesterEmail !== 'string') return requesterEmail;

    const body = await request.json();
    const { name, slotCount, aspectRatio } = body;

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
      requesterEmail
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
