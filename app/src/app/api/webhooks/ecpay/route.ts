export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { parseCallback } from '@/lib/ecpay';
import { addCredits, getCreditRecord } from '@/lib/credits';
import { captureError } from '@/lib/errors';
import { logger } from '@/lib/logger';

// Credit pack definitions (must match checkout route)
const CREDIT_PACKS: Record<number, number> = {
  499: 1,    // single: NT$499 = 1 credit
  1999: 5,   // pack5: NT$1999 = 5 credits
  299: 20,   // pack20: NT$299 = 20 credits
  599: 50,   // pack50: NT$599 = 50 credits
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const callbackData = await parseCallback(formData);

    logger.log('ECPay webhook received:', {
      orderId: callbackData.merchantTradeNo,
      rtnCode: callbackData.rtnCode,
      amount: callbackData.tradeAmt,
      email: callbackData.email,
      isValid: callbackData.isValid,
    });

    // Verify CheckMacValue
    if (!callbackData.isValid) {
      logger.error('Invalid CheckMacValue');
      return new NextResponse('0|Invalid CheckMacValue', { status: 400 });
    }

    // Check if payment was successful
    if (callbackData.rtnCode !== '1') {
      logger.log('Payment not successful:', callbackData.rtnMsg);
      // ECPay expects "1|OK" even for failed payments (we just don't credit)
      return new NextResponse('1|OK');
    }

    // Get email from CustomField1
    const email = callbackData.email?.toLowerCase().trim();
    if (!email) {
      logger.error('No email in callback');
      return new NextResponse('0|No email', { status: 400 });
    }

    // Determine credits from amount
    const credits = CREDIT_PACKS[callbackData.tradeAmt];
    if (!credits) {
      logger.error('Unknown amount:', callbackData.tradeAmt);
      return new NextResponse('0|Unknown amount', { status: 400 });
    }

    // Idempotency check: use order ID as purchase ID
    const orderId = callbackData.merchantTradeNo;
    const existingRecord = await getCreditRecord(email);

    if (existingRecord?.purchases?.some(p => p.id === orderId)) {
      logger.log('Duplicate webhook, already processed:', orderId);
      return new NextResponse('1|OK');
    }

    // Add credits
    await addCredits(email, credits, {
      id: orderId,
      credits,
      amountTWD: callbackData.tradeAmt,
      createdAt: new Date().toISOString(),
      provider: 'ecpay',
      ecpayTradeNo: callbackData.tradeNo,
    });

    logger.log('Credits added:', { email, credits, orderId });

    // ECPay requires "1|OK" response
    return new NextResponse('1|OK');
  } catch (error) {
    captureError(error, { route: '/api/webhooks/ecpay' });
    logger.error('ECPay webhook error:', error);
    // Return error but still acknowledge receipt
    return new NextResponse('0|Error', { status: 500 });
  }
}

// ECPay may also send GET requests for testing
export async function GET() {
  return new NextResponse('ECPay webhook endpoint ready');
}
