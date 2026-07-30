import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// Mock the KV module before importing anything that (transitively) depends on it.
// Mirrors the pattern in src/lib/credits.test.ts.
const mockStore = new Map<string, string>();

vi.mock('@/lib/kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  kvDelete: vi.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
  kvListKeys: vi.fn(() => Promise.resolve([])),
}));

import { POST } from './route';
import { generateCheckMacValue } from '@/lib/ecpay';
import { getCreditRecord } from '@/lib/credits';

// ECPay documented test credentials (matches getCredentials() under ECPAY_TEST_MODE=true)
const TEST_HASH_KEY = 'pwFHCqoQZGmho4w6';
const TEST_HASH_IV = 'EkRm7iFT261dpevs';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockStore.clear();
  process.env.ECPAY_TEST_MODE = 'true';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

interface CallbackFields {
  orderId: string;
  tradeAmt: number;
  email: string;
  packId?: string;
  rtnCode?: string;
}

/** Build a NextRequest-like object whose formData() yields a validly-signed ECPay callback. */
async function buildCallbackRequest(fields: CallbackFields): Promise<NextRequest> {
  const params: Record<string, string> = {
    MerchantID: '3002607',
    MerchantTradeNo: fields.orderId,
    RtnCode: fields.rtnCode ?? '1',
    RtnMsg: 'Succeeded',
    TradeNo: '2601010000000000',
    TradeAmt: String(fields.tradeAmt),
    PaymentDate: '2026/01/01 00:00:00',
    PaymentType: 'Credit_CreditCard',
    CustomField1: fields.email,
  };
  if (fields.packId !== undefined) {
    params.CustomField2 = fields.packId;
  }

  const checkMacValue = await generateCheckMacValue(params, TEST_HASH_KEY, TEST_HASH_IV);

  const formData = new FormData();
  for (const [key, value] of Object.entries(params)) {
    formData.set(key, value);
  }
  formData.set('CheckMacValue', checkMacValue);

  return { formData: async () => formData } as unknown as NextRequest;
}

describe('ECPay webhook credit resolution', () => {
  it('credits by pack when CustomField2 names a known pack matching the paid amount', async () => {
    const req = await buildCallbackRequest({
      orderId: 'GLTEST-PACK20',
      tradeAmt: 299,
      email: 'packbuyer@example.com',
      packId: 'pack20',
    });

    const res = await POST(req);
    expect(await res.text()).toBe('1|OK');

    const record = await getCreditRecord('packbuyer@example.com');
    expect(record.total).toBe(20);
    expect(record.purchases).toHaveLength(1);
    expect(record.purchases[0].id).toBe('GLTEST-PACK20');
  });

  it('falls back to the amount map when the packId price does not match the paid amount (no over-crediting)', async () => {
    // CustomField2 says pack50 (NT$599) but only NT$299 was actually paid —
    // must NOT credit 50; must fall back to amount-based lookup (299 -> 20).
    const req = await buildCallbackRequest({
      orderId: 'GLTEST-MISMATCH',
      tradeAmt: 299,
      email: 'mismatch@example.com',
      packId: 'pack50',
    });

    const res = await POST(req);
    expect(await res.text()).toBe('1|OK');

    const record = await getCreditRecord('mismatch@example.com');
    expect(record.total).toBe(20);
    expect(record.total).not.toBe(50);
  });

  it('falls back to the amount map when CustomField2 is missing (covers pre-deploy / historical orders)', async () => {
    // Historical order 1: GL1771826184703V6HK, NT$299 -> 20 credits
    const req1 = await buildCallbackRequest({
      orderId: 'GL1771826184703V6HK',
      tradeAmt: 299,
      email: 'historical1@example.com',
    });
    const res1 = await POST(req1);
    expect(await res1.text()).toBe('1|OK');
    const record1 = await getCreditRecord('historical1@example.com');
    expect(record1.total).toBe(20);

    // Historical order 2: GL1785389855830K63I, NT$599 -> 50 credits
    const req2 = await buildCallbackRequest({
      orderId: 'GL1785389855830K63I',
      tradeAmt: 599,
      email: 'historical2@example.com',
    });
    const res2 = await POST(req2);
    expect(await res2.text()).toBe('1|OK');
    const record2 = await getCreditRecord('historical2@example.com');
    expect(record2.total).toBe(50);
  });

  it('rejects when both the packId and the amount are unknown', async () => {
    const req = await buildCallbackRequest({
      orderId: 'GLTEST-UNKNOWN',
      tradeAmt: 123,
      email: 'unknown@example.com',
      packId: 'nope',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('0|Unknown amount');

    const record = await getCreditRecord('unknown@example.com');
    expect(record.total).toBe(0);
  });

  it('is idempotent on duplicate orderId — credits added only once', async () => {
    const fields: CallbackFields = {
      orderId: 'GLTEST-DUP',
      tradeAmt: 299,
      email: 'dup@example.com',
      packId: 'pack20',
    };

    const res1 = await POST(await buildCallbackRequest(fields));
    expect(await res1.text()).toBe('1|OK');

    const res2 = await POST(await buildCallbackRequest(fields));
    expect(await res2.text()).toBe('1|OK');

    const record = await getCreditRecord('dup@example.com');
    expect(record.total).toBe(20); // not 40
    expect(record.purchases).toHaveLength(1);
  });
});
