/**
 * Pure aggregation for /api/admin/users' list mode. Fed with plain records
 * the route has already fetched from KV (free-tier usage must be read via
 * credits.ts's getFreeRecord upstream, not reparsed here) — no KV access in
 * this file, so it stays trivially unit-testable.
 */

import type { CreditRecord, PurchaseRecord } from '@/types';

export interface AdminUserRow {
  email: string;
  verified: boolean;
  paidTotal: number;
  paidUsed: number;
  paidRemaining: number;
  freeUsed: number;
  purchases: PurchaseRecord[];
  lastJobAt: string | null;
  jobCount: number;
}

export interface AdminJobRef {
  email?: string;
  createdAt: string;
}

export interface BuildAdminUserRowsInput {
  creditRecords: Record<string, CreditRecord>; // normalized (lowercased) email -> record
  freeUsed: Record<string, number>; // normalized email -> free.used
  verifiedEmails: Set<string>; // normalized emails
  jobs: AdminJobRef[];
}

export function buildAdminUserRows(input: BuildAdminUserRowsInput): AdminUserRow[] {
  const emails = new Set<string>();
  Object.keys(input.creditRecords).forEach((e) => emails.add(e));
  Object.keys(input.freeUsed).forEach((e) => emails.add(e));
  input.verifiedEmails.forEach((e) => emails.add(e));

  const jobsByEmail = new Map<string, { count: number; lastAt: string | null }>();
  for (const job of input.jobs) {
    if (!job.email) continue;
    const email = job.email.toLowerCase();
    emails.add(email);
    const entry = jobsByEmail.get(email) || { count: 0, lastAt: null };
    entry.count += 1;
    if (!entry.lastAt || new Date(job.createdAt).getTime() > new Date(entry.lastAt).getTime()) {
      entry.lastAt = job.createdAt;
    }
    jobsByEmail.set(email, entry);
  }

  const rows: AdminUserRow[] = [];
  for (const email of emails) {
    const record = input.creditRecords[email] || { total: 0, used: 0, purchases: [] };
    const jobInfo = jobsByEmail.get(email) || { count: 0, lastAt: null };
    rows.push({
      email,
      verified: input.verifiedEmails.has(email),
      paidTotal: record.total,
      paidUsed: record.used,
      paidRemaining: record.total - record.used,
      freeUsed: input.freeUsed[email] || 0,
      purchases: record.purchases,
      lastJobAt: jobInfo.lastAt,
      jobCount: jobInfo.count,
    });
  }

  rows.sort((a, b) => {
    if (!a.lastJobAt && !b.lastJobAt) return 0;
    if (!a.lastJobAt) return 1;
    if (!b.lastJobAt) return -1;
    return new Date(b.lastJobAt).getTime() - new Date(a.lastJobAt).getTime();
  });

  return rows;
}
