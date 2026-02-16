export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

const CLOUD_RUN_URL = process.env.EXPORT_SERVICE_URL;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://glimmer.video';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const exportId = searchParams.get('exportId');

  if (!exportId) {
    return NextResponse.json(
      { error: 'Missing exportId' },
      { status: 400 }
    );
  }

  if (!CLOUD_RUN_URL) {
    return NextResponse.json(
      { error: 'Export service not configured' },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(`${CLOUD_RUN_URL}/export-status/${exportId}`);

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Export not found', status: 'not_found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Status check failed: ${response.status}` },
        { status: 502 }
      );
    }

    const result = await response.json();

    // If complete, build download URL
    if (result.status === 'complete' && result.r2Key) {
      return NextResponse.json({
        ...result,
        downloadUrl: `${BASE_URL}/api/export-download?key=${encodeURIComponent(result.r2Key)}`,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[export-status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check export status' },
      { status: 500 }
    );
  }
}
