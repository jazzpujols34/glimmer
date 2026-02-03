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

import { checkCredits, useCredit, addCredits, isValidEmail, isEmailVerified, setEmailVerified, FREE_GENERATIONS } from './credits';

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
  it('returns 10 free generations for new user', async () => {
    const balance = await checkCredits('new@example.com');
    expect(balance.paidTotal).toBe(0);
    expect(balance.paidUsed).toBe(0);
    expect(balance.freeUsed).toBe(0);
    expect(balance.freeTotal).toBe(FREE_GENERATIONS);
    expect(balance.remaining).toBe(FREE_GENERATIONS); // 10 free generations
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

  it('shows paid generations plus remaining free', async () => {
    await addCredits('paid@example.com', 20, {
      id: 'purchase_1',
      credits: 20,
      amountTWD: 299,
      createdAt: new Date().toISOString(),
    });
    const balance = await checkCredits('paid@example.com');
    expect(balance.paidTotal).toBe(20);
    expect(balance.remaining).toBe(30); // 20 paid + 10 free
  });
});

describe('useCredit', () => {
  it('uses free generations first', async () => {
    const result = await useCredit('user@example.com', 'job_1');
    expect(result.success).toBe(true);
    expect(result.usedFree).toBe(true);
  });

  it('tracks free generation usage', async () => {
    await useCredit('user@example.com', 'job_1');
    const balance = await checkCredits('user@example.com');
    expect(balance.freeUsed).toBe(1);
    expect(balance.remaining).toBe(FREE_GENERATIONS - 1); // 9 remaining
  });

  it('uses all 10 free generations before failing', async () => {
    // Use all 10 free generations
    for (let i = 0; i < FREE_GENERATIONS; i++) {
      const result = await useCredit('user@example.com', `job_${i}`);
      expect(result.success).toBe(true);
      expect(result.usedFree).toBe(true);
    }

    // 11th should fail (no paid credits)
    const result = await useCredit('user@example.com', 'job_11');
    expect(result.success).toBe(false);
    expect(result.usedFree).toBe(false);
  });

  it('uses paid generations after free is exhausted', async () => {
    // Use all free generations
    for (let i = 0; i < FREE_GENERATIONS; i++) {
      await useCredit('user@example.com', `job_${i}`);
    }

    // Add paid credits
    await addCredits('user@example.com', 5, {
      id: 'purchase_1', credits: 5, amountTWD: 99, createdAt: new Date().toISOString(),
    });

    // Should now use paid credits
    const result = await useCredit('user@example.com', 'job_paid_1');
    expect(result.success).toBe(true);
    expect(result.usedFree).toBe(false);

    const balance = await checkCredits('user@example.com');
    expect(balance.paidUsed).toBe(1);
    expect(balance.remaining).toBe(4); // 5 - 1 paid, free exhausted
  });
});

describe('addCredits', () => {
  it('adds generations to record', async () => {
    const { added, record } = await addCredits('user@example.com', 20, {
      id: 'purchase_1', credits: 20, amountTWD: 299, createdAt: new Date().toISOString(),
    });
    expect(added).toBe(true);
    expect(record.total).toBe(20);
    expect(record.purchases).toHaveLength(1);
  });

  it('is idempotent — rejects duplicate purchase IDs', async () => {
    const purchase = {
      id: 'purchase_1', credits: 20, amountTWD: 299, createdAt: new Date().toISOString(),
    };
    await addCredits('user@example.com', 20, purchase);
    const { added, record } = await addCredits('user@example.com', 20, purchase);
    expect(added).toBe(false);
    expect(record.total).toBe(20); // not doubled
    expect(record.purchases).toHaveLength(1);
  });

  it('accumulates multiple purchases', async () => {
    await addCredits('user@example.com', 20, {
      id: 'p1', credits: 20, amountTWD: 299, createdAt: new Date().toISOString(),
    });
    await addCredits('user@example.com', 50, {
      id: 'p2', credits: 50, amountTWD: 599, createdAt: new Date().toISOString(),
    });
    const balance = await checkCredits('user@example.com');
    expect(balance.paidTotal).toBe(70);
    expect(balance.remaining).toBe(80); // 70 paid + 10 free
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
