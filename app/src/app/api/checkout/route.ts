export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { isValidEmail } from '@/lib/credits';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { createPaymentFormData } from '@/lib/ecpay';

// Credit pack definitions
const CREDIT_PACKS: Record<string, { credits: number; priceTWD: number; label: string }> = {
  single: { credits: 1, priceTWD: 499, label: '單次生成' },
  pack5: { credits: 5, priceTWD: 1999, label: '5次生成組合包' },
  pack20: { credits: 20, priceTWD: 299, label: '20次生成組合包' },
  pack50: { credits: 50, priceTWD: 599, label: '50次生成組合包' },
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
    if (!pack) {
      return NextResponse.json({ error: '無效的方案' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://glimmer.video';

    // Generate unique order ID
    const orderId = `GL${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // Create ECPay payment
    const { paymentUrl, formData } = await createPaymentFormData({
      orderId,
      amount: pack.priceTWD,
      description: '拾光 Glimmer AI 影片生成',
      email: email.toLowerCase().trim(),
      itemName: `${pack.label} (${pack.credits} 次生成)`,
      returnUrl: `${appUrl}/api/ecpay-return`,
      notifyUrl: `${appUrl}/api/webhooks/ecpay`,
      clientBackUrl: `${appUrl}/create`,
    });

    // Store order info for webhook validation (optional, for extra security)
    // We use CustomField1 to pass email, and parse orderId format to get credits

    // Return form data for client to POST to ECPay
    return NextResponse.json({
      paymentUrl,
      formData,
      orderId,
    });
  } catch (error) {
    captureError(error, { route: '/api/checkout' });
    console.error('Checkout error:', error);
    return NextResponse.json({ error: '發生錯誤，請稍後再試' }, { status: 500 });
  }
}
