export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { checkCredits, isValidEmail } from '@/lib/credits';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 30 credit checks per minute per IP
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`credits:${ip}`, 30, 60);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const email = request.nextUrl.searchParams.get('email');
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: '請提供有效的 Email' }, { status: 400 });
    }

    const balance = await checkCredits(email);
    return NextResponse.json(balance);
  } catch (error) {
    captureError(error, { route: '/api/credits' });
    return NextResponse.json({ error: '發生錯誤' }, { status: 500 });
  }
}
