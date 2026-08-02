/**
 * Pure aggregation for /api/admin/jobs. Recomputes cost fields from settings
 * via the same functions the generate path uses — never trusts a stored
 * cost value — so the route stays a thin wrapper.
 */

import { creditsForGeneration } from './credit-cost';
import { estimatedTokensForGeneration } from './spend-guard';
import type { GenerationJob } from '@/types';

const DEFAULT_USD_PER_MILLION_TOKENS = 1.2;

export interface AdminJobRow {
  id: string;
  email?: string;
  ip?: string;
  createdAt: string;
  status: string;
  settingsSummary: string;
  creditsCharged: number;
  estTokens: number;
  estCostUSD: number;
}

export interface BuildAdminJobRowsOptions {
  emailFilter?: string;
  usdPerMillionTokens?: number;
}

function summarize(settings: GenerationJob['settings']): string {
  if (!settings) return '未知設定';
  const resolution = settings.resolution || '720p';
  const duration = settings.videoLength ?? 5;
  const numResults = settings.numResults ?? 1;
  const taskType = settings.taskType || 'image-to-video';
  return `${resolution} · ${duration}s · x${numResults} · ${taskType}`;
}

export function buildAdminJobRows(jobs: GenerationJob[], options: BuildAdminJobRowsOptions = {}): AdminJobRow[] {
  const usdPerM = options.usdPerMillionTokens ?? DEFAULT_USD_PER_MILLION_TOKENS;
  const emailFilter = options.emailFilter?.toLowerCase().trim();

  const filtered = emailFilter
    ? jobs.filter((j) => j.email?.toLowerCase() === emailFilter)
    : jobs;

  const rows = filtered.map((j) => {
    const estTokens = j.settings ? estimatedTokensForGeneration(j.settings) : 0;
    return {
      id: j.id,
      email: j.email,
      ip: j.ip,
      createdAt: j.createdAt,
      status: j.status,
      settingsSummary: summarize(j.settings),
      creditsCharged: j.settings ? creditsForGeneration(j.settings) : 0,
      estTokens,
      estCostUSD: (estTokens / 1_000_000) * usdPerM,
    };
  });

  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return rows;
}
