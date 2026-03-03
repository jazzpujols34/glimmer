export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { checkCredits } from '@/lib/credits';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { isValidEmail } from '@/lib/validation';
import { successResponse, errors } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 30 credit checks per minute per IP
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`credits:${ip}`, 30, 60);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return errors.rateLimited(retryAfter);
    }

    const email = request.nextUrl.searchParams.get('email');
    if (!email || !isValidEmail(email)) {
      return errors.invalidEmail();
    }

    const balance = await checkCredits(email);
    return successResponse(balance);
  } catch (error) {
    captureError(error, { route: '/api/credits' });
    return errors.serverError();
  }
}
