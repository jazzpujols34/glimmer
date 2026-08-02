export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { kvGet, kvPut, kvDelete } from '@/lib/kv';
import { captureError } from '@/lib/errors';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

// Hit a public Seedance task ID to verify BytePlus auth works without
// consuming any credits. 404 = auth OK, 401/403 = auth broken.
const BYTEPLUS_AUTH_PROBE_URL =
  'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/healthcheck-invalid-id';

interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export async function GET(request: NextRequest) {
  // Rate limit: 6 per minute per IP — each hit makes a real BytePlus outbound call
  const ip = getClientIP(request);
  const rateCheck = await checkRateLimit(`health:${ip}`, 6, 60);
  if (!rateCheck.allowed) {
    const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  // Sentry capture verification: GET /api/health?fail=1 → throws
  if (new URL(request.url).searchParams.get('fail') === '1') {
    const err = new Error('Sentry capture test from /api/health?fail=1');
    captureError(err, { route: '/api/health' });
    return NextResponse.json(
      { status: 'test_error', message: 'Captured test error — check Sentry' },
      { status: 500 }
    );
  }

  const [kv, byteplus] = await Promise.all([checkKV(), checkBytePlus()]);
  const allOk = kv.ok && byteplus.ok;

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { kv, byteplus },
    },
    { status: allOk ? 200 : 503 }
  );
}

async function checkKV(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const key = `health:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await kvPut(key, '1', { expirationTtl: 60 });
    const value = await kvGet(key);
    await kvDelete(key);
    if (value !== '1') throw new Error('KV roundtrip value mismatch');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function checkBytePlus(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.BYTEPLUS_API_KEY;
    if (!apiKey) throw new Error('BYTEPLUS_API_KEY not set');
    const res = await fetch(BYTEPLUS_AUTH_PROBE_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`BytePlus auth rejected: ${res.status}`);
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
