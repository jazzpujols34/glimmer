export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { setEmailVerified } from '@/lib/credits';
import { kvGet, kvDelete } from '@/lib/kv';

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://glimmer.video';

  try {
    const token = request.nextUrl.searchParams.get('token');
    const email = request.nextUrl.searchParams.get('email');

    if (!token || !email) {
      return NextResponse.redirect(`${appUrl}/create?verify_error=invalid`);
    }

    // Look up token in KV
    const data = await kvGet(`verify:${token}`);
    if (!data) {
      // Token expired or doesn't exist
      return NextResponse.redirect(`${appUrl}/create?verify_error=expired`);
    }

    const stored = JSON.parse(data) as { email: string; createdAt: string };
    const normalized = email.toLowerCase().trim();

    // Validate email matches
    if (stored.email !== normalized) {
      return NextResponse.redirect(`${appUrl}/create?verify_error=invalid`);
    }

    // Mark email as verified (permanent)
    await setEmailVerified(normalized);

    // Delete token (one-time use)
    await kvDelete(`verify:${token}`);

    console.log(`[Verify] Email verified: ${normalized}`);
    return NextResponse.redirect(`${appUrl}/create?verified=1`);
  } catch (error) {
    console.error('Verify confirm error:', error);
    return NextResponse.redirect(`${appUrl}/create?verify_error=error`);
  }
}
