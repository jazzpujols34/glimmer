#!/usr/bin/env node
/**
 * Batch Status Checker
 *
 * Usage:
 *   node scripts/batch-status.mjs [--watch] [--base-url http://localhost:3000]
 *
 * Options:
 *   --watch      Keep polling until all complete (every 30s)
 *   --base-url   API base URL (default: http://localhost:3000)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const watch = args.includes('--watch');

function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const baseUrl = getArg('base-url', 'http://localhost:3000');

// Load jobs file
const jobsFile = path.join(__dirname, 'batch-jobs.json');
if (!fs.existsSync(jobsFile)) {
  console.error('No batch-jobs.json found. Run batch-generate.mjs first.');
  process.exit(1);
}

const jobData = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));
console.log(`Batch created: ${jobData.createdAt}`);
console.log(`Total jobs: ${jobData.jobs.length}\n`);

async function checkStatus(jobId) {
  try {
    const res = await fetch(`${baseUrl}/api/status/${jobId}`);
    if (!res.ok) return { status: 'error', error: `HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

async function checkAll() {
  const results = await Promise.all(
    jobData.jobs.map(async (job) => {
      const status = await checkStatus(job.jobId);
      return { ...job, ...status };
    })
  );

  // Group by status (API returns 'complete', normalize to 'completed')
  const byStatus = {
    completed: results.filter(r => r.status === 'completed' || r.status === 'complete'),
    processing: results.filter(r => r.status === 'processing'),
    pending: results.filter(r => r.status === 'pending'),
    failed: results.filter(r => r.status === 'failed' || r.status === 'error'),
  };

  console.log(`=== Status at ${new Date().toLocaleTimeString()} ===`);
  console.log(`Completed:  ${byStatus.completed.length}`);
  console.log(`Processing: ${byStatus.processing.length}`);
  console.log(`Pending:    ${byStatus.pending.length}`);
  console.log(`Failed:     ${byStatus.failed.length}`);

  // Show completed videos
  if (byStatus.completed.length > 0) {
    console.log('\n--- Completed Videos ---');
    for (const job of byStatus.completed) {
      console.log(`\n${job.filename}:`);
      if (job.videoUrls?.length) {
        job.videoUrls.forEach((url, i) => {
          // Truncate long URLs
          const displayUrl = url.length > 80 ? url.slice(0, 77) + '...' : url;
          console.log(`  [${i + 1}] ${displayUrl}`);
        });
      }
    }
  }

  // Show failures
  if (byStatus.failed.length > 0) {
    console.log('\n--- Failed ---');
    byStatus.failed.forEach(job => {
      console.log(`  ${job.filename}: ${job.error || 'Unknown error'}`);
    });
  }

  // Show processing progress
  if (byStatus.processing.length > 0 && byStatus.processing.length <= 5) {
    console.log('\n--- Processing ---');
    byStatus.processing.forEach(job => {
      console.log(`  ${job.filename}: ${job.progress || 0}%`);
    });
  }

  return byStatus;
}

// Initial check
let byStatus = await checkAll();

// Watch mode
if (watch) {
  const allDone = () =>
    byStatus.processing.length === 0 && byStatus.pending.length === 0;

  while (!allDone()) {
    console.log('\n--- Waiting 30s... (Ctrl+C to stop) ---\n');
    await new Promise(r => setTimeout(r, 30000));
    byStatus = await checkAll();
  }

  console.log('\n=== All jobs complete! ===');

  // Save final results
  const resultsFile = path.join(__dirname, 'batch-results.json');
  const allResults = await Promise.all(
    jobData.jobs.map(async (job) => {
      const status = await checkStatus(job.jobId);
      return { ...job, ...status };
    })
  );
  fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));
  console.log(`Results saved to: ${resultsFile}`);
}
