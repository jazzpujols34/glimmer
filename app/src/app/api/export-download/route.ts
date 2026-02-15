export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { r2Get } from '@/lib/r2';
import { captureError } from '@/lib/errors';

/**
 * Download exported video from R2.
 * Query params: key (R2 object key)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    // Validate key format (should be exports/{jobId}/{exportId}.mp4)
    if (!key.startsWith('exports/') || !key.endsWith('.mp4')) {
      return NextResponse.json({ error: 'Invalid key format' }, { status: 400 });
    }

    console.log(`[export-download] Fetching: ${key}`);

    const r2Object = await r2Get(key);
    if (!r2Object) {
      return NextResponse.json(
        { error: '找不到匯出檔案，可能已過期' },
        { status: 404 }
      );
    }

    // Extract filename from key for download
    const filename = `glimmer-export-${key.split('/').pop()}`;

    const headers = new Headers({
      'Content-Type': r2Object.contentType,
      'Content-Length': String(r2Object.size),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600', // 1 hour cache
    });

    return new NextResponse(r2Object.body, { status: 200, headers });

  } catch (error) {
    captureError(error, { route: '/api/export-download' });
    console.error('[export-download] Error:', error);
    return NextResponse.json(
      { error: '下載失敗' },
      { status: 500 }
    );
  }
}
