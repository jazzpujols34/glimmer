import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { checkCredits, consumeCredit, consumeCredits, addCredits, isEmailVerified, setEmailVerified, isLegacyFlatRate, FREE_GENERATIONS } from './credits';
import { isValidEmail } from './validation';

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
  it('returns FREE_GENERATIONS free generations for new user', async () => {
    const balance = await checkCredits('new@example.com');
    expect(balance.paidTotal).toBe(0);
    expect(balance.paidUsed).toBe(0);
    expect(balance.freeUsed).toBe(0);
    expect(balance.freeTotal).toBe(FREE_GENERATIONS);
    expect(balance.remaining).toBe(FREE_GENERATIONS);
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
    expect(balance.remaining).toBe(20 + FREE_GENERATIONS);
  });
});

describe('consumeCredit', () => {
  it('uses free generations first', async () => {
    const result = await consumeCredit('user@example.com', 'job_1');
    expect(result.success).toBe(true);
    expect(result.usedFree).toBe(true);
  });

  it('tracks free generation usage', async () => {
    await consumeCredit('user@example.com', 'job_1');
    const balance = await checkCredits('user@example.com');
    expect(balance.freeUsed).toBe(1);
    expect(balance.remaining).toBe(FREE_GENERATIONS - 1);
  });

  it('uses all free generations before failing', async () => {
    for (let i = 0; i < FREE_GENERATIONS; i++) {
      const result = await consumeCredit('user@example.com', `job_${i}`);
      expect(result.success).toBe(true);
      expect(result.usedFree).toBe(true);
    }

    // Next request should fail (no paid credits)
    const result = await consumeCredit('user@example.com', 'job_extra');
    expect(result.success).toBe(false);
    expect(result.usedFree).toBe(false);
  });

  it('uses paid generations after free is exhausted', async () => {
    // Use all free generations
    for (let i = 0; i < FREE_GENERATIONS; i++) {
      await consumeCredit('user@example.com', `job_${i}`);
    }

    // Add paid credits
    await addCredits('user@example.com', 5, {
      id: 'purchase_1', credits: 5, amountTWD: 99, createdAt: new Date().toISOString(),
    });

    // Should now use paid credits
    const result = await consumeCredit('user@example.com', 'job_paid_1');
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
    expect(balance.remaining).toBe(70 + FREE_GENERATIONS);
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

describe('consumeCredits (variable amount)', () => {
  it('spends free credits first, when the amount fits entirely within free remaining', async () => {
    const result = await consumeCredits('multi@example.com', 'job_multi', 2);
    expect(result).toEqual({ success: true, usedFree: 2, usedPaid: 0 });

    const balance = await checkCredits('multi@example.com');
    expect(balance.freeUsed).toBe(2);
    expect(balance.paidUsed).toBe(0);
  });

  it('spans free and paid pools when the amount exceeds free remaining', async () => {
    const email = 'span@example.com';
    // Use up all but 1 free generation first
    await consumeCredits(email, 'job_pre', FREE_GENERATIONS - 1);
    await addCredits(email, 5, {
      id: 'purchase_span', credits: 5, amountTWD: 599, createdAt: new Date().toISOString(),
    });

    const result = await consumeCredits(email, 'job_span', 3);
    expect(result).toEqual({ success: true, usedFree: 1, usedPaid: 2 });

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(FREE_GENERATIONS);
    expect(balance.paidUsed).toBe(2);
    expect(balance.remaining).toBe(3); // 5 paid - 2 used, free exhausted
  });

  it('refuses and deducts nothing when free + paid together cannot cover the amount', async () => {
    const email = 'short@example.com';
    const result = await consumeCredits(email, 'job_short', FREE_GENERATIONS + 1);
    expect(result).toEqual({ success: false, usedFree: 0, usedPaid: 0 });

    // No partial charge — balance must be completely untouched
    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(0);
    expect(balance.paidUsed).toBe(0);
    expect(balance.remaining).toBe(FREE_GENERATIONS);
  });

  it('consumeCredit (singular) still works and delegates to consumeCredits(..., 1)', async () => {
    const result = await consumeCredit('legacy-single@example.com', 'job_single');
    expect(result).toEqual({ success: true, usedFree: true });
  });
});

describe('consumeCredits — admin', () => {
  const ORIGINAL = process.env.ADMIN_EMAILS;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = ORIGINAL;
    }
    vi.resetModules();
  });

  it('admin succeeds and deducts nothing, regardless of the requested amount', async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    vi.resetModules();
    const fresh = await import('./credits');

    const result = await fresh.consumeCredits('admin@example.com', 'job_admin', 50);
    expect(result).toEqual({ success: true, usedFree: 0, usedPaid: 0 });

    const balance = await fresh.checkCredits('admin@example.com');
    expect(balance.isAdmin).toBe(true);
    expect(balance.freeUsed).toBe(0);
  });
});

describe('isLegacyFlatRate', () => {
  const ORIGINAL = process.env.LEGACY_FLAT_RATE_EMAILS;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.LEGACY_FLAT_RATE_EMAILS;
    } else {
      process.env.LEGACY_FLAT_RATE_EMAILS = ORIGINAL;
    }
    vi.resetModules();
  });

  it('is false for everyone when the env var is empty (default)', () => {
    expect(isLegacyFlatRate('anyone@example.com')).toBe(false);
  });

  it('matches emails on the list case-insensitively, and excludes emails not on it', async () => {
    process.env.LEGACY_FLAT_RATE_EMAILS = 'Legacy@Example.com, other@example.com';
    vi.resetModules();
    const fresh = await import('./credits');

    expect(fresh.isLegacyFlatRate('legacy@example.com')).toBe(true);
    expect(fresh.isLegacyFlatRate('LEGACY@EXAMPLE.COM')).toBe(true);
    expect(fresh.isLegacyFlatRate('nope@example.com')).toBe(false);
  });
});
