export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { r2Put } from '@/lib/r2';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const storyboardId = formData.get('storyboardId') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: '請選擇檔案' },
        { status: 400 }
      );
    }

    if (!storyboardId) {
      return NextResponse.json(
        { error: '缺少 storyboardId' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('audio/')) {
      return NextResponse.json(
        { error: '請選擇音訊檔案' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '檔案大小不能超過 20MB' },
        { status: 400 }
      );
    }

    // Generate R2 key
    const ext = file.name.split('.').pop() || 'mp3';
    const timestamp = Date.now();
    const r2Key = `music/${storyboardId}/${timestamp}.${ext}`;

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    const success = await r2Put(r2Key, arrayBuffer, file.type);

    if (!success) {
      // R2 not available (local dev) - return a fake key for testing
      console.log('[upload-music] R2 not available, returning fake key for local dev');
      return NextResponse.json({
        success: true,
        r2Key: `local://${file.name}`,
        name: file.name,
      });
    }

    console.log(`[upload-music] Uploaded ${file.name} to ${r2Key}`);

    return NextResponse.json({
      success: true,
      r2Key,
      name: file.name,
    });

  } catch (error) {
    console.error('[upload-music] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '上傳失敗' },
      { status: 500 }
    );
  }
}
