export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { isValidEmail, isEmailVerified } from '@/lib/credits';
import { sendVerificationEmail } from '@/lib/email';
import { kvPut } from '@/lib/kv';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';

const VERIFY_TOKEN_TTL = 900; // 15 minutes

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);

    // Rate limit: 3 per IP per 10 minutes
    const ipCheck = await checkRateLimit(`verify:ip:${ip}`, 3, 600);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        { error: '驗證請求過於頻繁，請稍後再試' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const email = body.email as string;

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: '請提供有效的 Email 地址' }, { status: 400 });
    }

    const normalized = email.toLowerCase().trim();

    // Rate limit: 5 per email per hour
    const emailCheck = await checkRateLimit(`verify:email:${normalized}`, 5, 3600);
    if (!emailCheck.allowed) {
      return NextResponse.json(
        { error: '該 Email 驗證請求過於頻繁，請稍後再試' },
        { status: 429 },
      );
    }

    // Skip if already verified
    const verified = await isEmailVerified(normalized);
    if (verified) {
      return NextResponse.json({ alreadyVerified: true });
    }

    // Generate token and store in KV
    const token = crypto.randomUUID();
    await kvPut(
      `verify:${token}`,
      JSON.stringify({ email: normalized, createdAt: new Date().toISOString() }),
      { expirationTtl: VERIFY_TOKEN_TTL },
    );

    // Send email
    const result = await sendVerificationEmail(normalized, token);
    if (!result.success) {
      console.error(`[Verify] Failed to send email to ${normalized}:`, result.error);
      return NextResponse.json({ error: '寄送驗證信失敗，請稍後再試' }, { status: 503 });
    }

    console.log(`[Verify] Sent verification email to ${normalized}`);
    return NextResponse.json({ sent: true });
  } catch (error) {
    captureError(error, { route: '/api/verify/send' });
    return NextResponse.json({ error: '發生錯誤' }, { status: 500 });
  }
}
