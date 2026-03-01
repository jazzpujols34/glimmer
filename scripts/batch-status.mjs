#!/usr/bin/env node
/**
 * Batch Status Checker
 *
 * Usage:
 *   node scripts/batch-status.mjs [--watch] [--base-url https://glimmer.video]
 *
 * Options:
 *   --watch      Keep polling until all complete (every 30s)
 *   --base-url   API base URL (default: https://glimmer.video)
 *   --interval   Poll interval in seconds for watch mode (default: 30)
 *   --concurrency  Max concurrent status checks (default: 5)
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

const baseUrl = getArg('base-url', 'https://glimmer.video');
const pollInterval = parseInt(getArg('interval', '30'), 10);
const concurrency = parseInt(getArg('concurrency', '5'), 10);

// Load jobs file
const jobsFile = path.join(__dirname, 'batch-jobs.json');
if (!fs.existsSync(jobsFile)) {
  console.error('No batch-jobs.json found. Run batch-generate.mjs first.');
  process.exit(1);
}

const jobData = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));
const totalVideos = jobData.jobs.length * (jobData.config?.clips || 1);

console.log(`Batch created: ${jobData.createdAt}`);
console.log(`Jobs: ${jobData.jobs.length} | Expected videos: ${totalVideos}`);
console.log(`Model: ${jobData.config?.model || '?'} | Occasion: ${jobData.config?.occasion || '?'}`);
console.log(`API: ${baseUrl}\n`);

async function checkStatus(jobId) {
  try {
    const res = await fetch(`${baseUrl}/api/status/${jobId}`);
    if (!res.ok) return { status: 'error', error: `HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

// Rate-limited concurrent status checks
async function checkAllWithConcurrency(jobs, limit) {
  const results = [];
  for (let i = 0; i < jobs.length; i += limit) {
    const batch = jobs.slice(i, i + limit);
    const batchResults = await Promise.all(
      batch.map(async (job) => {
        const status = await checkStatus(job.jobId);
        return { ...job, ...status };
      })
    );
    results.push(...batchResults);
  }
  return results;
}

async function checkAll() {
  const results = await checkAllWithConcurrency(jobData.jobs, concurrency);

  // Group by status (API returns 'complete', normalize)
  const byStatus = {
    completed: results.filter(r => r.status === 'completed' || r.status === 'complete'),
    processing: results.filter(r => r.status === 'processing'),
    pending: results.filter(r => r.status === 'pending' || r.status === 'queued'),
    failed: results.filter(r => r.status === 'failed' || r.status === 'error'),
  };

  const completedVideos = byStatus.completed.reduce((sum, j) => sum + (j.videoUrls?.length || 0), 0);
  const elapsed = Math.round((Date.now() - new Date(jobData.createdAt).getTime()) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  console.log(`=== Status at ${new Date().toLocaleTimeString()} (${mins}m${secs}s elapsed) ===`);
  console.log(`Completed:  ${byStatus.completed.length}/${jobData.jobs.length} jobs (${completedVideos}/${totalVideos} videos)`);
  if (byStatus.processing.length) console.log(`Processing: ${byStatus.processing.length}`);
  if (byStatus.pending.length) console.log(`Pending:    ${byStatus.pending.length}`);
  if (byStatus.failed.length) console.log(`Failed:     ${byStatus.failed.length}`);

  // Progress bar
  const pct = Math.round((byStatus.completed.length / jobData.jobs.length) * 100);
  const filled = Math.round(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  console.log(`[${bar}] ${pct}%`);

  // Show completed videos
  if (byStatus.completed.length > 0) {
    console.log('\n--- Completed ---');
    for (const job of byStatus.completed) {
      const clipCount = job.videoUrls?.length || 0;
      console.log(`  ${job.filename}: ${clipCount} clips`);
    }
  }

  // Show processing progress
  if (byStatus.processing.length > 0) {
    console.log('\n--- Processing ---');
    byStatus.processing.forEach(job => {
      console.log(`  ${job.filename}: ${job.progress || 0}%`);
    });
  }

  // Show failures with details
  if (byStatus.failed.length > 0) {
    console.log('\n--- Failed ---');
    byStatus.failed.forEach(job => {
      console.log(`  ${job.filename}: ${job.error || 'Unknown error'}`);
    });
  }

  return byStatus;
}

// Initial check
let byStatus = await checkAll();

// Auto-watch if jobs are still in progress
const hasInProgress = byStatus.processing.length > 0 || byStatus.pending.length > 0;
const shouldWatch = watch || (hasInProgress && !watch);

if (shouldWatch && hasInProgress) {
  if (!watch) {
    console.log(`\nJobs still in progress — auto-polling every ${pollInterval}s (Ctrl+C to stop)`);
  }

  while (byStatus.processing.length > 0 || byStatus.pending.length > 0) {
    console.log(`\n--- Polling in ${pollInterval}s... (Ctrl+C to stop) ---\n`);
    await new Promise(r => setTimeout(r, pollInterval * 1000));
    byStatus = await checkAll();
  }

  console.log('\n=== All jobs complete! ===');
}

// Save results when all done
if (byStatus.processing.length === 0 && byStatus.pending.length === 0) {
  const resultsFile = path.join(__dirname, 'batch-results.json');
  const allResults = await checkAllWithConcurrency(jobData.jobs, concurrency);
  fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to: ${resultsFile}`);

  // Gallery link
  console.log(`\nView in gallery: ${baseUrl}/gallery`);
}
