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

import { checkCredits, consumeCredit, consumeCredits, refundCredits, addCredits, isEmailVerified, setEmailVerified, canonicalFreeTierEmail, FREE_GENERATIONS } from './credits';
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
  it('amount === 1 still uses free-first (unchanged behavior)', async () => {
    const result = await consumeCredits('single@example.com', 'job_single', 1);
    expect(result).toEqual({ success: true, usedFree: 1, usedPaid: 0 });
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

describe('consumeCredits — amount > 1 (non-standard spec) draws PAID credits only', () => {
  // Free tier is standard-spec only (720p/5s/x1 == creditsForGeneration() === 1).
  // Any amount > 1 must never dip into the free pool, even when free alone
  // would cover it — it must come entirely from paid, or fail entirely.
  it('never dips into free tier when amount > 1, even though free remaining fully covers it', async () => {
    const email = 'multi-no-paid@example.com';
    const result = await consumeCredits(email, 'job_multi', 2);
    expect(result).toEqual({ success: false, usedFree: 0, usedPaid: 0 });

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(0); // untouched — free tier never dipped into
    expect(balance.paidUsed).toBe(0);
    expect(balance.remaining).toBe(FREE_GENERATIONS);
  });

  it('succeeds purely from paid credits when paid covers it — free tier untouched even though it has room', async () => {
    const email = 'multi-paid@example.com';
    await addCredits(email, 5, {
      id: 'purchase_multi', credits: 5, amountTWD: 599, createdAt: new Date().toISOString(),
    });

    const result = await consumeCredits(email, 'job_multi_paid', 3);
    expect(result).toEqual({ success: true, usedFree: 0, usedPaid: 3 });

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(0); // free tier is fully intact
    expect(balance.paidUsed).toBe(3);
    expect(balance.remaining).toBe(FREE_GENERATIONS + 2); // 2 paid left + all 3 free
  });

  it('fails when paid alone cannot cover it, even though free+paid combined could', async () => {
    const email = 'multi-insufficient-paid@example.com';
    await addCredits(email, 1, {
      id: 'purchase_small', credits: 1, amountTWD: 99, createdAt: new Date().toISOString(),
    });
    // free (3) + paid (1) = 4 >= amount (2) under the OLD spanning rule, but
    // paid alone (1) < amount (2) — must fail under the new paid-only rule.
    const result = await consumeCredits(email, 'job_multi_fail', 2);
    expect(result).toEqual({ success: false, usedFree: 0, usedPaid: 0 });

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(0);
    expect(balance.paidUsed).toBe(0);
  });

  it('boundary: amount = 2 is already paid-only (the free-first path is exactly amount === 1)', async () => {
    const email = 'boundary@example.com';
    // Exhaust nothing — free is fully available (3), but amount=2 must still
    // refuse without paid credits.
    const result = await consumeCredits(email, 'job_boundary', 2);
    expect(result.success).toBe(false);
  });
});

describe('refundCredits', () => {
  it('reverses a free-tier consumption exactly, restoring remaining balance', async () => {
    const email = 'refund-free@example.com';
    // Free tier is only ever touched by amount === 1 (standard-spec) calls.
    const consumed = await consumeCredits(email, 'job_1', 1);
    expect(consumed).toEqual({ success: true, usedFree: 1, usedPaid: 0 });

    await refundCredits(email, 'job_1', consumed.usedFree, consumed.usedPaid);

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(0);
    expect(balance.remaining).toBe(FREE_GENERATIONS);
  });

  it('reverses a paid consumption exactly, restoring remaining balance', async () => {
    const email = 'refund-paid@example.com';
    // Exhaust free tier via amount===1 calls (amount>1 never touches free).
    for (let i = 0; i < FREE_GENERATIONS; i++) {
      await consumeCredits(email, `job_pre_${i}`, 1);
    }
    await addCredits(email, 5, {
      id: 'purchase_refund', credits: 5, amountTWD: 599, createdAt: new Date().toISOString(),
    });
    const consumed = await consumeCredits(email, 'job_paid', 3);
    expect(consumed).toEqual({ success: true, usedFree: 0, usedPaid: 3 });

    await refundCredits(email, 'job_paid', consumed.usedFree, consumed.usedPaid);

    const balance = await checkCredits(email);
    expect(balance.paidUsed).toBe(0);
    expect(balance.remaining).toBe(5); // 5 paid, free exhausted
  });

  it('reverses a non-standard-spec (amount > 1) consumption drawn entirely from paid, free tier stays untouched throughout', async () => {
    const email = 'refund-multi@example.com';
    await addCredits(email, 5, {
      id: 'purchase_multi', credits: 5, amountTWD: 599, createdAt: new Date().toISOString(),
    });
    const consumed = await consumeCredits(email, 'job_multi', 3);
    expect(consumed).toEqual({ success: true, usedFree: 0, usedPaid: 3 });

    await refundCredits(email, 'job_multi', consumed.usedFree, consumed.usedPaid);

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(0); // never touched, before or after refund
    expect(balance.paidUsed).toBe(0);
    expect(balance.remaining).toBe(FREE_GENERATIONS + 5);
  });

  it('never goes below zero even if called with amounts larger than what was ever consumed', async () => {
    const email = 'refund-overshoot@example.com';
    // Never consumed anything for this email.
    await refundCredits(email, 'job_phantom', 999, 999);

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(0);
    expect(balance.paidUsed).toBe(0);
    // Bounded by the pre-existing free/paid caps — cannot exceed FREE_GENERATIONS.
    expect(balance.remaining).toBe(FREE_GENERATIONS);
  });

  it('is a no-op for admins (nothing was ever deducted from them)', async () => {
    process.env.ADMIN_EMAILS = 'refund-admin@example.com';
    vi.resetModules();
    const fresh = await import('./credits');

    await fresh.refundCredits('refund-admin@example.com', 'job_admin', 1, 1);
    const balance = await fresh.checkCredits('refund-admin@example.com');
    expect(balance.isAdmin).toBe(true);
    expect(balance.freeUsed).toBe(0);

    delete process.env.ADMIN_EMAILS;
    vi.resetModules();
  });

  it('does nothing when both amounts are zero', async () => {
    const email = 'refund-noop@example.com';
    await consumeCredits(email, 'job_1', 1);
    await refundCredits(email, 'job_1', 0, 0);

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(1); // untouched
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

describe('legacy free records with used > FREE_GENERATIONS (regression)', () => {
  // Historical `free:` records from an earlier era used a different cap (5, 6,
  // 9, 10) — current enforcement treats used >= FREE_GENERATIONS as exhausted
  // and must never surface a negative "remaining" anywhere.
  it('checkCredits floors freeUsed-derived remaining at zero, never negative', async () => {
    const email = 'legacy-overcap@example.com';
    mockStore.set(`free:${email}`, JSON.stringify({ used: 10, jobs: [] }));

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(10);
    expect(balance.freeTotal).toBe(FREE_GENERATIONS);
    expect(balance.remaining).toBe(0); // never negative, even though used(10) > total(3)
  });

  it('consumeCredits treats an over-cap free record as fully exhausted and falls through to paid', async () => {
    const email = 'legacy-overcap-consume@example.com';
    mockStore.set(`free:${email}`, JSON.stringify({ used: 10, jobs: [] }));
    await addCredits(email, 5, {
      id: 'purchase_legacy', credits: 5, amountTWD: 599, createdAt: new Date().toISOString(),
    });

    const result = await consumeCredits(email, 'job_legacy', 1);
    expect(result).toEqual({ success: true, usedFree: 0, usedPaid: 1 });

    const balance = await checkCredits(email);
    expect(balance.freeUsed).toBe(10); // stored value preserved as-is, never decremented below its own floor issues
    expect(balance.remaining).toBe(4); // 5 paid - 1 used, free contributes 0
  });

  it('consumeCredits refuses (never goes negative) when an over-cap free record leaves no paid credits either', async () => {
    const email = 'legacy-overcap-no-paid@example.com';
    mockStore.set(`free:${email}`, JSON.stringify({ used: 10, jobs: [] }));

    const result = await consumeCredits(email, 'job_legacy_fail', 1);
    expect(result).toEqual({ success: false, usedFree: 0, usedPaid: 0 });

    const balance = await checkCredits(email);
    expect(balance.remaining).toBe(0);
  });
});

describe('canonicalFreeTierEmail (pure function)', () => {
  it('always lowercases and trims, regardless of domain', () => {
    expect(canonicalFreeTierEmail('  User@Example.COM  ')).toBe('user@example.com');
  });

  it('strips everything from + in the local part for gmail.com', () => {
    expect(canonicalFreeTierEmail('user+promo@gmail.com')).toBe('user@gmail.com');
  });

  it('removes dots from the local part for gmail.com', () => {
    expect(canonicalFreeTierEmail('u.s.e.r@gmail.com')).toBe('user@gmail.com');
  });

  it('handles combined dot and plus tricks for gmail.com', () => {
    expect(canonicalFreeTierEmail('U.ser.Name+promo123@Gmail.com')).toBe('username@gmail.com');
  });

  it('applies the same rules to googlemail.com, preserving that domain (no cross-domain unification)', () => {
    expect(canonicalFreeTierEmail('u.ser+promo@googlemail.com')).toBe('user@googlemail.com');
  });

  it('leaves other domains completely unchanged beyond lowercase/trim — dots and plus are preserved', () => {
    expect(canonicalFreeTierEmail('U.Ser+x@Yahoo.com')).toBe('u.ser+x@yahoo.com');
    expect(canonicalFreeTierEmail('a.b+c@Hotmail.com')).toBe('a.b+c@hotmail.com');
  });

  it('plain gmail address with no dots/plus is unchanged (same key as before this feature)', () => {
    expect(canonicalFreeTierEmail('plainuser@gmail.com')).toBe('plainuser@gmail.com');
  });
});

describe('free-tier identity canonicalization (gmail alias dedup)', () => {
  it('gmail dot and plus variants collapse onto the same free-tier record', async () => {
    await consumeCredits('user@gmail.com', 'job_1', 1);
    const balance = await checkCredits('u.ser+anything@gmail.com');
    expect(balance.freeUsed).toBe(1);
  });

  it('credits:/verified: keys stay exact-email — paid identity is NOT canonicalized', async () => {
    await addCredits('user+promo@gmail.com', 5, {
      id: 'purchase_alias', credits: 5, amountTWD: 599, createdAt: new Date().toISOString(),
    });
    const aliasBalance = await checkCredits('user+promo@gmail.com');
    const canonicalBalance = await checkCredits('user@gmail.com');
    expect(aliasBalance.paidTotal).toBe(5);
    expect(canonicalBalance.paidTotal).toBe(0); // separate credits: key — no collapsing
  });

  it('non-gmail providers are not deduplicated across dot/plus variants', async () => {
    await consumeCredits('a.b@yahoo.com', 'job_1', 1);
    const balance = await checkCredits('ab@yahoo.com');
    expect(balance.freeUsed).toBe(0); // distinct free: key — yahoo isn't canonicalized
  });

  it('plain gmail address behaves exactly as before this feature (no dots/plus to collapse)', async () => {
    await consumeCredits('plainuser@gmail.com', 'job_1', 1);
    const balance = await checkCredits('plainuser@gmail.com');
    expect(balance.freeUsed).toBe(1);
  });
});
