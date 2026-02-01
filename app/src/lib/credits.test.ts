import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the KV module before importing credits
const mockStore = new Map<string, string>();

vi.mock('./kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  kvDelete: vi.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
}));

import { checkCredits, useCredit, addCredits, isValidEmail, isEmailVerified, setEmailVerified } from './credits';

beforeEach(() => {
  mockStore.clear();
});

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('a.b@c.d.e')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user @example.com')).toBe(false);
  });
});

describe('checkCredits', () => {
  it('returns free credit available for new user', async () => {
    const balance = await checkCredits('new@example.com');
    expect(balance.total).toBe(0);
    expect(balance.used).toBe(0);
    expect(balance.freeUsed).toBe(false);
    expect(balance.remaining).toBe(1); // 1 free credit
    expect(balance.verified).toBe(false);
  });

  it('includes verified status', async () => {
    await setEmailVerified('verified@example.com');
    const balance = await checkCredits('verified@example.com');
    expect(balance.verified).toBe(true);
  });

  it('normalizes email to lowercase', async () => {
    await setEmailVerified('Upper@Example.COM');
    const balance = await checkCredits('upper@example.com');
    expect(balance.verified).toBe(true);
  });

  it('shows paid credits', async () => {
    await addCredits('paid@example.com', 5, {
      id: 'purchase_1',
      credits: 5,
      amountTWD: 1999,
      createdAt: new Date().toISOString(),
    });
    const balance = await checkCredits('paid@example.com');
    expect(balance.total).toBe(5);
    expect(balance.remaining).toBe(6); // 5 paid + 1 free
  });
});

describe('useCredit', () => {
  it('uses free credit first', async () => {
    const result = await useCredit('user@example.com', 'job_1');
    expect(result.success).toBe(true);
    expect(result.usedFree).toBe(true);
  });

  it('marks free credit as used after first use', async () => {
    await useCredit('user@example.com', 'job_1');
    const balance = await checkCredits('user@example.com');
    expect(balance.freeUsed).toBe(true);
    expect(balance.remaining).toBe(0);
  });

  it('fails when no credits remain', async () => {
    await useCredit('user@example.com', 'job_1'); // uses free
    const result = await useCredit('user@example.com', 'job_2');
    expect(result.success).toBe(false);
    expect(result.usedFree).toBe(false);
  });

  it('uses paid credits after free is exhausted', async () => {
    await useCredit('user@example.com', 'job_1'); // uses free
    await addCredits('user@example.com', 3, {
      id: 'purchase_1', credits: 3, amountTWD: 999, createdAt: new Date().toISOString(),
    });
    const result = await useCredit('user@example.com', 'job_2');
    expect(result.success).toBe(true);
    expect(result.usedFree).toBe(false);

    const balance = await checkCredits('user@example.com');
    expect(balance.used).toBe(1);
    expect(balance.remaining).toBe(2); // 3 - 1 paid, free already used
  });
});

describe('addCredits', () => {
  it('adds credits to record', async () => {
    const { added, record } = await addCredits('user@example.com', 5, {
      id: 'purchase_1', credits: 5, amountTWD: 1999, createdAt: new Date().toISOString(),
    });
    expect(added).toBe(true);
    expect(record.total).toBe(5);
    expect(record.purchases).toHaveLength(1);
  });

  it('is idempotent — rejects duplicate purchase IDs', async () => {
    const purchase = {
      id: 'purchase_1', credits: 5, amountTWD: 1999, createdAt: new Date().toISOString(),
    };
    await addCredits('user@example.com', 5, purchase);
    const { added, record } = await addCredits('user@example.com', 5, purchase);
    expect(added).toBe(false);
    expect(record.total).toBe(5); // not doubled
    expect(record.purchases).toHaveLength(1);
  });

  it('accumulates multiple purchases', async () => {
    await addCredits('user@example.com', 5, {
      id: 'p1', credits: 5, amountTWD: 1999, createdAt: new Date().toISOString(),
    });
    await addCredits('user@example.com', 1, {
      id: 'p2', credits: 1, amountTWD: 499, createdAt: new Date().toISOString(),
    });
    const balance = await checkCredits('user@example.com');
    expect(balance.total).toBe(6);
    expect(balance.remaining).toBe(7); // 6 paid + 1 free
  });
});

describe('email verification', () => {
  it('reports not verified by default', async () => {
    const result = await isEmailVerified('user@example.com');
    expect(result).toBe(false);
  });

  it('reports verified after setEmailVerified', async () => {
    await setEmailVerified('user@example.com');
    const result = await isEmailVerified('user@example.com');
    expect(result).toBe(true);
  });

  it('normalizes email for verification', async () => {
    await setEmailVerified('USER@EXAMPLE.COM');
    expect(await isEmailVerified('user@example.com')).toBe(true);
  });
});
