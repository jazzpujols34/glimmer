export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { isValidEmail } from '@/lib/credits';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';

// Credit pack definitions — Price IDs come from environment (will switch to ECPay)
const CREDIT_PACKS: Record<string, { credits: number; priceTWD: number; priceId: string }> = {
  single: { credits: 1, priceTWD: 499, priceId: process.env.PAYMENT_PRICE_SINGLE || '' },
  pack5: { credits: 5, priceTWD: 1999, priceId: process.env.PAYMENT_PRICE_PACK5 || '' },
};

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 checkout attempts per minute per IP
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`checkout:${ip}`, 10, 60);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { email, packId } = body;

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: '請提供有效的 Email 地址' }, { status: 400 });
    }

    const pack = CREDIT_PACKS[packId];
    if (!pack || !pack.priceId) {
      return NextResponse.json({ error: '無效的方案' }, { status: 400 });
    }

    // --- Payment gateway: Stripe (will swap to ECPay) ---
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: '付款系統未設定' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://glimmer.video';

    // Create Stripe Checkout Session via REST API (Edge-compatible, no SDK needed)
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('customer_email', email.toLowerCase().trim());
    params.append('line_items[0][price]', pack.priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', `${appUrl}/purchase/success?session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${appUrl}/create`);
    params.append('metadata[email]', email.toLowerCase().trim());
    params.append('metadata[packId]', packId);
    params.append('metadata[credits]', String(pack.credits));

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errData = await res.json();
      console.error('Checkout error:', errData);
      return NextResponse.json({ error: '建立付款連結失敗' }, { status: 500 });
    }

    const session = await res.json();
    return NextResponse.json({ url: session.url });
  } catch (error) {
    captureError(error, { route: '/api/checkout' });
    return NextResponse.json({ error: '發生錯誤' }, { status: 500 });
  }
}
