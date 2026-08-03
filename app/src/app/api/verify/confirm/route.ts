export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { setEmailVerified } from '@/lib/credits';
import { kvGet, kvDelete, kvPut } from '@/lib/kv';
import { signSession, sessionCookieHeader } from '@/lib/session';
import { parseLinkPurpose, shouldArmSession, emailSub, type VerifyTokenRecord } from '@/lib/magic-link';
import { captureError } from '@/lib/errors';
import { logger } from '@/lib/logger';

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

    const stored = JSON.parse(data) as VerifyTokenRecord;
    const purpose = parseLinkPurpose(stored.purpose);
    const normalized = email.toLowerCase().trim();

    // Validate email matches
    if (stored.email !== normalized) {
      return NextResponse.redirect(`${appUrl}/create?verify_error=invalid`);
    }

    // Mark email as verified (permanent)
    await setEmailVerified(normalized);

    // Delete token (one-time use)
    await kvDelete(`verify:${token}`);

    // Issue the session BEFORE arming, and treat a signing failure as
    // non-fatal. Order matters in both directions here:
    //
    //  - Email verification predates sessions and must never start depending
    //    on session infrastructure. If SESSION_SECRET were missing,
    //    signSession() throws; letting that reach the catch below would send
    //    the user to verify_error=error even though the email IS verified and
    //    the one-time token is already spent — unrecoverable, since the retry
    //    link no longer exists.
    //  - Arming after a failed signing would be worse: the account would
    //    require a session it never received, with the token burned. Every
    //    subsequent login link would fail the same way. So we only arm once
    //    we actually hold a token.
    let sessionToken: string | null = null;
    try {
      sessionToken = await signSession({ sub: emailSub(normalized), email: normalized });
    } catch (err) {
      captureError(err, { route: '/api/verify/confirm', stage: 'signSession' });
    }

    // Arm session enforcement only for an explicit login link. A first-time
    // verification link must not arm: the user may have opened it in their
    // mail app's in-app browser, and the tab they were actually working in
    // would start refusing to generate with no obvious way back.
    if (sessionToken && shouldArmSession(purpose)) {
      await kvPut(`sessionreq:${normalized}`, '1');
    }

    logger.debug('verify', `Email ${purpose === 'login' ? 'login' : 'verified'}: ${normalized}`);

    const res = NextResponse.redirect(
      `${appUrl}/create?verified=1&email=${encodeURIComponent(normalized)}`,
    );
    // Both purposes issue a session to the browser that clicked — proof of
    // inbox control is exactly what a session attests. Only 'login' arms.
    if (sessionToken) {
      res.headers.append('Set-Cookie', sessionCookieHeader(sessionToken));
    }
    return res;
  } catch (error) {
    captureError(error, { route: '/api/verify/confirm' });
    return NextResponse.redirect(`${appUrl}/create?verify_error=error`);
  }
}
