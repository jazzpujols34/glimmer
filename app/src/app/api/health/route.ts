export const runtime = 'edge';

import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * Simple health check endpoint for monitoring and deployment verification.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
}
