export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { addCredits } from '@/lib/credits';
import type { PurchaseRecord } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      return NextResponse.json({ error: 'Missing signature or config' }, { status: 400 });
    }

    // Verify webhook signature (Edge-compatible via crypto.subtle)
    const verified = await verifyStripeSignature(body, signature, webhookSecret);
    if (!verified) {
      console.error('Stripe webhook signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(body);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.metadata?.email || session.customer_email;
      const credits = parseInt(session.metadata?.credits || '0', 10);

      if (!email || credits <= 0) {
        console.error('Webhook: missing email or credits in metadata', { email, credits });
        return NextResponse.json({ received: true }); // Don't retry
      }

      const purchase: PurchaseRecord = {
        id: session.id,
        credits,
        amountTWD: session.amount_total || 0, // TWD is zero-decimal in Stripe
        createdAt: new Date().toISOString(),
      };

      const result = await addCredits(email, credits, purchase);
      if (result.added) {
        console.log(`[Webhook] Added ${credits} credits for ${email} (session: ${session.id})`);
      } else {
        console.log(`[Webhook] Duplicate session ${session.id} for ${email}, skipped`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

// --- Edge-compatible Stripe signature verification ---
// Stripe-Signature header format: t=timestamp,v1=hmac_hex
// Expected HMAC: SHA256(webhookSecret, "timestamp.payload")

async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const parts = signatureHeader.split(',');
  let timestamp = '';
  let signature = '';

  for (const part of parts) {
    const [key, ...valueParts] = part.split('=');
    const value = valueParts.join('=');
    if (key === 't') timestamp = value;
    if (key === 'v1' && !signature) signature = value; // Use first v1
  }

  if (!timestamp || !signature) return false;

  // Reject timestamps older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  // Compute HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signedPayload = `${timestamp}.${payload}`;
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expectedSig = bufferToHex(new Uint8Array(sigBuffer));

  return expectedSig === signature;
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}
