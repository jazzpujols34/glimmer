export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { isEmailVerified } from '@/lib/credits';
import { sendVerificationEmail } from '@/lib/email';
import { kvPut } from '@/lib/kv';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { isValidEmail } from '@/lib/validation';
import { successResponse, errorResponse, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { parseLinkPurpose } from '@/lib/magic-link';

const VERIFY_TOKEN_TTL = 86400; // 24 hours
// A login link hands out a 30-day session, so it gets a far tighter window
// than a first-time verification link — a sign-in link sitting in an inbox
// (or a forwarded thread) for a day is a standing key to the account.
const LOGIN_TOKEN_TTL = 900; // 15 minutes

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);

    // Rate limit: 3 per IP per 10 minutes
    const ipCheck = await checkRateLimit(`verify:ip:${ip}`, 3, 600);
    if (!ipCheck.allowed) {
      const retryAfter = Math.max(1, ipCheck.resetAt - Math.floor(Date.now() / 1000));
      return errors.rateLimited(retryAfter);
    }

    const body = await request.json();
    const email = body.email as string;
    // 'login' = an explicit "send me a sign-in link". Absent/unrecognised is
    // 'verify', i.e. exactly the behaviour that predates magic-link.
    const purpose = parseLinkPurpose(body.purpose);

    if (!email || !isValidEmail(email)) {
      return errors.invalidEmail();
    }

    const normalized = email.toLowerCase().trim();

    // Rate limit: 5 per email per hour
    const emailCheck = await checkRateLimit(`verify:email:${normalized}`, 5, 3600);
    if (!emailCheck.allowed) {
      const retryAfter = Math.max(1, emailCheck.resetAt - Math.floor(Date.now() / 1000));
      return errors.rateLimited(retryAfter);
    }

    // Skip if already verified — but only for verification links. A login
    // link is precisely what an already-verified user needs: before this,
    // every established customer was unreachable by email link, which is why
    // no account could ever arm session enforcement.
    const verified = await isEmailVerified(normalized);
    if (verified && purpose === 'verify') {
      return successResponse({ alreadyVerified: true });
    }

    // Generate token and store in KV
    const token = crypto.randomUUID();
    await kvPut(
      `verify:${token}`,
      JSON.stringify({ email: normalized, createdAt: new Date().toISOString(), purpose }),
      { expirationTtl: purpose === 'login' ? LOGIN_TOKEN_TTL : VERIFY_TOKEN_TTL },
    );

    // Send email
    const result = await sendVerificationEmail(normalized, token, purpose);
    if (!result.success) {
      logger.error(`[Verify] Failed to send email to ${normalized}:`, result.error);
      return errorResponse('寄送驗證信失敗，請稍後再試', 503, 'PROVIDER_ERROR');
    }

    logger.debug('verify', `Sent verification email to ${normalized}`);
    return successResponse({ sent: true });
  } catch (error) {
    captureError(error, { route: '/api/verify/send' });
    return errors.serverError();
  }
}
