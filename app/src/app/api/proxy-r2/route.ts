export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { r2Get } from '@/lib/r2';

/**
 * Proxy R2 objects for external access (e.g., Cloud Run export service).
 * Query param: key (R2 object key, e.g., "uploads/{jobId}/{uuid}.mp4")
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    // Security: only allow specific prefixes
    const allowedPrefixes = ['uploads/', 'videos/', 'exports/'];
    if (!allowedPrefixes.some(prefix => key.startsWith(prefix))) {
      return NextResponse.json({ error: 'Invalid key prefix' }, { status: 403 });
    }

    console.log(`[proxy-r2] Fetching key: ${key}`);

    const r2Object = await r2Get(key);
    if (!r2Object) {
      console.error(`[proxy-r2] Object not found: ${key}`);
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }

    console.log(`[proxy-r2] Found object: ${key}, size=${r2Object.size}`);

    const headers = new Headers({
      'Content-Type': r2Object.contentType,
      'Content-Length': String(r2Object.size),
      'Cache-Control': 'public, s-maxage=3600, max-age=1800',
    });

    return new NextResponse(r2Object.body, { status: 200, headers });
  } catch (error) {
    console.error('[proxy-r2] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch object' }, { status: 500 });
  }
}
