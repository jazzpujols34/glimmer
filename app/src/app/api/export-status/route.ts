export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { captureError } from '@/lib/errors';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { errors } from '@/lib/api-response';

const CLOUD_RUN_URL = process.env.EXPORT_SERVICE_URL;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://glimmer.video';

export async function GET(request: NextRequest) {
  // Rate limit: 60 polls per minute per IP — frontend polls every 3s (20/min), 3x headroom
  const ip = getClientIP(request);
  const rateCheck = await checkRateLimit(`export-status:${ip}`, 60, 60);
  if (!rateCheck.allowed) {
    const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
    return errors.rateLimited(retryAfter);
  }

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
    captureError(error, { route: '/api/export-status' });
    return NextResponse.json(
      { error: 'Failed to check export status' },
      { status: 500 }
    );
  }
}
