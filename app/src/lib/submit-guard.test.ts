import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the KV module before importing the module under test.
const mockStore = new Map<string, string>();

vi.mock('./kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
}));

import {
  submitFingerprint,
  findRecentSubmit,
  claimSubmit,
  SUBMIT_WINDOW_SECONDS,
  type SubmitFingerprintInput,
} from './submit-guard';

beforeEach(() => {
  mockStore.clear();
});

const base: SubmitFingerprintInput = {
  email: 'albertchang810818@gmail.com',
  name: '張揚棣',
  occasion: 'memorial',
  settings: { model: 'byteplus', resolution: '720p', videoLength: 5, numResults: 4 },
  photoCount: 3,
  photoBytes: 1_482_112,
};

describe('SUBMIT_WINDOW_SECONDS', () => {
  it('is 90', () => {
    expect(SUBMIT_WINDOW_SECONDS).toBe(90);
  });
});

describe('submitFingerprint', () => {
  it('is deterministic for identical input', () => {
    expect(submitFingerprint(base)).toBe(submitFingerprint({ ...base }));
  });

  it('ignores settings key order — a retry serializing keys differently still matches', () => {
    const reordered = {
      ...base,
      settings: { numResults: 4, videoLength: 5, resolution: '720p', model: 'byteplus' },
    };
    expect(submitFingerprint(reordered)).toBe(submitFingerprint(base));
  });

  it('differs when the photo payload differs', () => {
    expect(submitFingerprint({ ...base, photoBytes: 1_482_113 })).not.toBe(submitFingerprint(base));
    expect(submitFingerprint({ ...base, photoCount: 4 })).not.toBe(submitFingerprint(base));
  });

  it('differs when settings differ', () => {
    const other = { ...base, settings: { ...(base.settings as object), numResults: 2 } };
    expect(submitFingerprint(other)).not.toBe(submitFingerprint(base));
  });

  it('differs per user — same photos and settings from another email are independent', () => {
    expect(submitFingerprint({ ...base, email: 'someone@else.com' })).not.toBe(submitFingerprint(base));
  });

  it('differs when the subject name differs', () => {
    expect(submitFingerprint({ ...base, name: '王小明' })).not.toBe(submitFingerprint(base));
  });

  it('produces a KV-safe key fragment regardless of input size', () => {
    const huge = {
      ...base,
      name: 'x'.repeat(5000),
      settings: { prompt: 'y'.repeat(20_000) },
    };
    const fp = submitFingerprint(huge);
    expect(fp.length).toBeLessThanOrEqual(32);
    expect(fp).toMatch(/^[a-z0-9]+$/);
  });
});

describe('findRecentSubmit / claimSubmit', () => {
  it('returns null when nothing was claimed', async () => {
    expect(await findRecentSubmit(submitFingerprint(base))).toBeNull();
  });

  it('returns the claimed reference for a repeat of the same submission', async () => {
    const fp = submitFingerprint(base);
    await claimSubmit(fp, { id: 'job_123', kind: 'job' });
    expect(await findRecentSubmit(fp)).toEqual({ id: 'job_123', kind: 'job' });
  });

  it('does not match a genuinely different submission', async () => {
    await claimSubmit(submitFingerprint(base), { id: 'job_123', kind: 'job' });
    const different = submitFingerprint({ ...base, photoBytes: 999 });
    expect(await findRecentSubmit(different)).toBeNull();
  });

  it('claims with the 90s TTL so the guard self-expires', async () => {
    const { kvPut } = await import('./kv');
    await claimSubmit(submitFingerprint(base), { id: 'batch_9', kind: 'batch' });
    expect(kvPut).toHaveBeenCalledWith(
      expect.stringContaining('submit:'),
      expect.any(String),
      { expirationTtl: SUBMIT_WINDOW_SECONDS },
    );
  });

  it('round-trips a batch reference', async () => {
    const fp = submitFingerprint(base);
    await claimSubmit(fp, { id: 'batch_9', kind: 'batch' });
    expect(await findRecentSubmit(fp)).toEqual({ id: 'batch_9', kind: 'batch' });
  });

  it('round-trips the destination path, including a query string', async () => {
    const fp = submitFingerprint(base);
    await claimSubmit(fp, { id: 'batch_9', kind: 'batch', path: '/batch/batch_9?quick=q_1' });
    expect(await findRecentSubmit(fp)).toEqual({
      id: 'batch_9',
      kind: 'batch',
      path: '/batch/batch_9?quick=q_1',
    });
  });

  it('survives a corrupt KV value instead of throwing', async () => {
    const fp = submitFingerprint(base);
    mockStore.set(`submit:${fp}`, 'not-json');
    expect(await findRecentSubmit(fp)).toBeNull();
  });
});
