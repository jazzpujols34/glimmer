#!/usr/bin/env node
/**
 * One-time legacy flat-rate -> proportional-pricing credit conversion.
 *
 * Pre-2026-07-30 customers bought credits under the old flat "1 credit per
 * generation regardless of settings" rule (LEGACY_FLAT_RATE_EMAILS /
 * isLegacyFlatRate — removed from src/lib/credits.ts and the generation
 * routes in this same change; everyone now pays proportional pricing per
 * src/lib/credit-cost.ts). Proportional pricing charges up to 6x flat rate
 * for the same settings, so this script scales each affected email's
 * REMAINING paid balance by exactly 6x (pure math in
 * src/lib/legacy-credit-conversion.ts, unit-tested there) so they keep the
 * generations they already paid for. Free-tier fields are never read or
 * written — this script only ever touches the `credits:<email>` KV record.
 *
 * REQUIRED EXECUTION ORDER — do not run --execute out of order:
 *   1. Deploy the flag-removal code (this branch: LEGACY_FLAT_RATE_EMAILS /
 *      isLegacyFlatRate removed from credits.ts + generate/generate-batch/
 *      quick-generate routes).
 *   2. Run this script with --execute for each affected email.
 *   3. Delete the LEGACY_FLAT_RATE_EMAILS env var from Cloudflare Pages prod.
 * Running --execute while the flat-rate code path is STILL deployed would
 * let an email keep buying at the old flat rate AFTER its balance was
 * already multiplied 6x — a jackpot leak. Steps 1 and 2 must not be
 * reordered; do not skip step 3.
 *
 * Usage (run from app/):
 *   node tools/convert-legacy-credits.ts <email> [<email> ...]            # dry run (default, read-only)
 *   node tools/convert-legacy-credits.ts <email> [<email> ...] --execute  # writes to KV
 *   (or `npx tsx tools/convert-legacy-credits.ts ...` if tsx is available — either works)
 *
 * Dry run is the default and only reads (wrangler kv key get) + writes a
 * local backup file — it never touches KV. --execute is required to write.
 *
 * Namespace id defaults to the id parsed from wrangler.toml's GLIMMER_KV
 * binding. NOTE: as of this writing wrangler.toml only has the LOCAL DEV
 * placeholder ("local-kv") — this repo's Cloudflare Pages KV binding for
 * production is configured via the CF dashboard, not recorded in
 * wrangler.toml. Pass --namespace-id <real-id> to target production (find
 * it with `wrangler kv namespace list` or the CF dashboard).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertLegacyRecord, summarizeConversion } from '../src/lib/legacy-credit-conversion.ts';
import type { CreditRecord } from '../src/types/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..');
const BACKUP_DIR = join(__dirname, 'backups');

// Must match CREDIT_PREFIX in src/lib/credits.ts exactly.
const CREDIT_KEY_PREFIX = 'credits:';

interface CliArgs {
  emails: string[];
  execute: boolean;
  namespaceId?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const emails: string[] = [];
  let execute = false;
  let namespaceId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--execute') {
      execute = true;
    } else if (arg === '--namespace-id') {
      namespaceId = argv[++i];
    } else {
      emails.push(arg.toLowerCase().trim());
    }
  }

  return { emails, execute, namespaceId };
}

/** Crude but sufficient parse of wrangler.toml's `[[kv_namespaces]]` block for binding = "GLIMMER_KV". */
function namespaceIdFromWranglerToml(): string {
  const tomlPath = join(APP_ROOT, 'wrangler.toml');
  const toml = readFileSync(tomlPath, 'utf-8');
  const blocks = toml.split('[[kv_namespaces]]').slice(1);

  for (const block of blocks) {
    if (/binding\s*=\s*"GLIMMER_KV"/.test(block)) {
      const match = block.match(/id\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    }
  }

  throw new Error(`Could not find a GLIMMER_KV binding id in ${tomlPath}`);
}

function wranglerKvGet(namespaceId: string, key: string): string | null {
  try {
    return execFileSync(
      'npx',
      ['wrangler', 'kv', 'key', 'get', key, '--namespace-id', namespaceId, '--remote', '--text'],
      { cwd: APP_ROOT, encoding: 'utf-8' },
    ).trim();
  } catch {
    // wrangler exits non-zero when the key doesn't exist in the namespace.
    return null;
  }
}

function wranglerKvPut(namespaceId: string, key: string, value: string): void {
  execFileSync(
    'npx',
    ['wrangler', 'kv', 'key', 'put', key, value, '--namespace-id', namespaceId, '--remote'],
    { cwd: APP_ROOT, encoding: 'utf-8' },
  );
}

function writeBackup(email: string, record: CreditRecord): string {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeEmail = email.replace(/[^a-z0-9.@-]/gi, '_');
  const path = join(BACKUP_DIR, `${safeEmail}_${stamp}.json`);
  writeFileSync(path, JSON.stringify(record, null, 2));
  return path;
}

function main(): void {
  const { emails, execute, namespaceId: namespaceIdOverride } = parseArgs(process.argv.slice(2));

  if (emails.length === 0) {
    console.error('Usage: node tools/convert-legacy-credits.ts <email> [<email> ...] [--execute] [--namespace-id <id>]');
    process.exitCode = 1;
    return;
  }

  const namespaceId = namespaceIdOverride ?? namespaceIdFromWranglerToml();
  if (namespaceId === 'local-kv') {
    console.warn(
      'WARNING: using the local-dev placeholder namespace id ("local-kv") from wrangler.toml.\n' +
      '  This will not reach production KV. Pass --namespace-id <real-id> for a real run\n' +
      '  (find it with `wrangler kv namespace list` or the CF dashboard).\n'
    );
  }

  console.log(`Mode: ${execute ? 'EXECUTE (writes to KV)' : 'DRY RUN (read-only)'}`);
  console.log(`Namespace: ${namespaceId}\n`);

  for (const email of emails) {
    const key = `${CREDIT_KEY_PREFIX}${email}`;
    console.log(`--- ${email} ---`);

    const raw = wranglerKvGet(namespaceId, key);
    if (!raw) {
      console.log(`  no credit record found for key "${key}" — skipping`);
      continue;
    }

    let record: CreditRecord;
    try {
      record = JSON.parse(raw);
    } catch {
      console.error(`  could not parse KV value as JSON — skipping. Raw value: ${raw}`);
      continue;
    }

    const backupPath = writeBackup(email, record);
    console.log(`  backup written: ${backupPath}`);

    const { before, after } = summarizeConversion(record);
    console.log(`  before: total=${before.total} used=${before.used} remaining=${before.remaining}`);
    console.log(`  after:  total=${after.total} used=${after.used} remaining=${after.remaining}`);

    if (!execute) {
      console.log('  (dry run — no write performed; pass --execute to apply)\n');
      continue;
    }

    const converted = convertLegacyRecord(record);
    wranglerKvPut(namespaceId, key, JSON.stringify(converted));
    console.log('  written to KV.\n');
  }
}

main();
