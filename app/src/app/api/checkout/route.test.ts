import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

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
  getKV: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/ecpay', () => ({
  createPaymentFormData: vi.fn(() => ({ action: 'https://ecpay.example/pay', fields: {} })),
}));

import { POST } from './route';
import { createPaymentFormData } from '@/lib/ecpay';

function buildRequest(): NextRequest {
  return new NextRequest('https://glimmer.video/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' },
    body: JSON.stringify({ email: 'buyer@example.com', packId: 'pack20' }),
  });
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_MAINTENANCE_MODE;
  mockStore.clear();
  vi.mocked(createPaymentFormData).mockClear();
});

describe('POST /api/checkout — maintenance mode', () => {
  it('refuses with MAINTENANCE and never builds a payment form', async () => {
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE = 'true';
    const res = await POST(buildRequest());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('MAINTENANCE');
    expect(createPaymentFormData).not.toHaveBeenCalled();
  });

  it('flag off: checkout still reaches the payment form', async () => {
    const res = await POST(buildRequest());
    expect(res.status).not.toBe(503);
    expect(createPaymentFormData).toHaveBeenCalled();
  });
});
