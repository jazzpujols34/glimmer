export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

/**
 * ECPay redirects users here via POST after payment.
 * We redirect to the success page (GET) to show the UI.
 */
export async function POST(request: NextRequest) {
  // ECPay sends payment result in form data, but we don't need to process it here
  // (the webhook /api/webhooks/ecpay handles the actual credit addition)

  // Build the success page URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://glimmer.video';
  const url = new URL('/purchase/success', appUrl);

  // 303 = See Other (redirect as GET)
  return NextResponse.redirect(url, 303);
}
