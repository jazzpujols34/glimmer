export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { r2Put } from '@/lib/r2';
import { captureError } from '@/lib/errors';

/**
 * Upload a video clip to R2 storage for server-side export.
 * This allows local files to be exported via Cloud Run.
 *
 * POST /api/upload-clip
 * Body: FormData with 'file' (video file) and 'jobId' (current editor job)
 * Returns: { success: true, r2Key: "uploads/{jobId}/{uuid}.mp4" }
 */

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit

export async function POST(request: NextRequest) {
  console.log('[upload-clip] Request received');
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const jobId = formData.get('jobId') as string | null;

    console.log('[upload-clip] Parsed formData:', {
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      jobId
    });

    if (!file) {
      console.log('[upload-clip] Error: Missing file');
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    if (!jobId) {
      console.log('[upload-clip] Error: Missing jobId');
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      return NextResponse.json({ error: 'File must be a video' }, { status: 400 });
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Generate unique key
    const uuid = crypto.randomUUID().substring(0, 8);
    const extension = file.name.split('.').pop() || 'mp4';
    const r2Key = `uploads/${jobId}/${uuid}.${extension}`;

    console.log(`[upload-clip] Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB) to ${r2Key}`);

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    const success = await r2Put(r2Key, arrayBuffer, file.type);

    if (!success) {
      console.error('[upload-clip] R2 upload failed - R2 may not be configured');
      return NextResponse.json(
        { error: 'Storage not available. Please use browser export.' },
        { status: 503 }
      );
    }

    console.log(`[upload-clip] Successfully uploaded to ${r2Key}`);

    return NextResponse.json({
      success: true,
      r2Key,
      size: file.size,
    });
  } catch (error) {
    captureError(error, { route: '/api/upload-clip' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
