import { describe, it, expect } from 'vitest';
import { buildAdminJobRows } from './admin-jobs';
import { defaultSettings } from '@/types';
import type { GenerationJob } from '@/types';

function job(overrides: Partial<GenerationJob>): GenerationJob {
  return {
    id: 'job_1',
    status: 'complete',
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildAdminJobRows', () => {
  it('recomputes creditsCharged and estTokens from settings rather than trusting stored values', () => {
    const rows = buildAdminJobRows([
      job({ settings: { ...defaultSettings, resolution: '720p', videoLength: 5, numResults: 1 } }),
    ]);
    expect(rows[0].creditsCharged).toBe(1);
    expect(rows[0].estTokens).toBe(108000);
    expect(rows[0].estCostUSD).toBeCloseTo(108000 / 1_000_000 * 1.2, 6);
  });

  it('scales estCostUSD with a custom usdPerMillionTokens option', () => {
    const rows = buildAdminJobRows(
      [job({ settings: { ...defaultSettings, resolution: '720p', videoLength: 5, numResults: 1 } })],
      { usdPerMillionTokens: 2 }
    );
    expect(rows[0].estCostUSD).toBeCloseTo(108000 / 1_000_000 * 2, 6);
  });

  it('jobs with no settings still produce a row with zeroed cost fields, never throwing', () => {
    const rows = buildAdminJobRows([job({ settings: undefined })]);
    expect(rows[0].creditsCharged).toBe(0);
    expect(rows[0].estTokens).toBe(0);
    expect(rows[0].estCostUSD).toBe(0);
  });

  it('settingsSummary includes resolution, duration, numResults and taskType', () => {
    const rows = buildAdminJobRows([
      job({ settings: { ...defaultSettings, resolution: '1080p', videoLength: 12, numResults: 4, taskType: 'first-last-frame' } }),
    ]);
    expect(rows[0].settingsSummary).toContain('1080p');
    expect(rows[0].settingsSummary).toContain('12');
    expect(rows[0].settingsSummary).toContain('4');
    expect(rows[0].settingsSummary).toContain('first-last-frame');
  });

  it('sorts newest first by createdAt', () => {
    const rows = buildAdminJobRows([
      job({ id: 'old', createdAt: '2026-08-01T00:00:00Z' }),
      job({ id: 'new', createdAt: '2026-08-03T00:00:00Z' }),
      job({ id: 'mid', createdAt: '2026-08-02T00:00:00Z' }),
    ]);
    expect(rows.map(r => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('filters by email (case-insensitive) when emailFilter is provided', () => {
    const rows = buildAdminJobRows(
      [job({ id: 'a', email: 'User@X.com' }), job({ id: 'b', email: 'other@x.com' })],
      { emailFilter: 'user@x.com' }
    );
    expect(rows.map(r => r.id)).toEqual(['a']);
  });

  it('empty emailFilter string behaves as no filter', () => {
    const rows = buildAdminJobRows(
      [job({ id: 'a', email: 'a@x.com' }), job({ id: 'b', email: 'b@x.com' })],
      { emailFilter: '' }
    );
    expect(rows).toHaveLength(2);
  });

  it('empty job list returns an empty array', () => {
    expect(buildAdminJobRows([])).toEqual([]);
  });
});
