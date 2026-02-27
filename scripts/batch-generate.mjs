#!/usr/bin/env node
/**
 * Batch Video Generation Script
 *
 * Usage:
 *   node scripts/batch-generate.mjs ./photos --email your@email.com --occasion memorial
 *
 * Options:
 *   --email       Your email (required for credits)
 *   --occasion    memorial | birthday | wedding | pet | other (default: memorial)
 *   --clips       Number of clips per photo, 1-4 (default: 3)
 *   --length      Video length in seconds, 2-12 (default: 5)
 *   --model       veo-3.1 | veo-3.1-fast | kling-ai | byteplus (default: byteplus)
 *   --concurrency Max concurrent requests (default: 3)
 *   --base-url    API base URL (default: http://localhost:3000)
 *   --dry-run     Just list files, don't generate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse CLI args
const args = process.argv.slice(2);
const photoDir = args.find(a => !a.startsWith('--')) || './photos';

function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const config = {
  email: getArg('email', ''),
  occasion: getArg('occasion', 'memorial'),
  clips: parseInt(getArg('clips', '3'), 10),
  length: parseInt(getArg('length', '5'), 10),
  model: getArg('model', 'byteplus'),
  concurrency: parseInt(getArg('concurrency', '1'), 10), // Default 1 to respect rate limit
  baseUrl: getArg('base-url', 'http://localhost:3000'),
  delay: parseInt(getArg('delay', '13'), 10), // Seconds between requests (5 req/min = 12s min)
  dryRun: args.includes('--dry-run'),
};

if (!config.email) {
  console.error('Error: --email is required');
  console.error('Usage: node scripts/batch-generate.mjs ./photos --email your@email.com');
  process.exit(1);
}

// Find all images in directory
const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
const photosPath = path.resolve(photoDir);

if (!fs.existsSync(photosPath)) {
  console.error(`Error: Directory not found: ${photosPath}`);
  process.exit(1);
}

const files = fs.readdirSync(photosPath)
  .filter(f => imageExtensions.includes(path.extname(f).toLowerCase()))
  .map(f => path.join(photosPath, f))
  .sort();

const estimatedTime = Math.ceil(files.length * config.delay / 60);
console.log(`
=== Batch Video Generation ===
Photos:      ${files.length} images in ${photosPath}
Email:       ${config.email}
Occasion:    ${config.occasion}
Clips/photo: ${config.clips}
Length:      ${config.length}s
Model:       ${config.model}
Concurrency: ${config.concurrency}
Delay:       ${config.delay}s between requests
API:         ${config.baseUrl}
Total jobs:  ${files.length} (${files.length * config.clips} videos)
Est. time:   ~${estimatedTime} min to submit all
`);

if (config.dryRun) {
  console.log('Files to process:');
  files.forEach((f, i) => console.log(`  ${i + 1}. ${path.basename(f)}`));
  console.log('\n(Dry run - no requests sent)');
  process.exit(0);
}

// Generate video for a single photo
async function generateVideo(photoPath, index) {
  const filename = path.basename(photoPath);
  const name = path.basename(photoPath, path.extname(photoPath));

  // Read file and create FormData
  const photoBuffer = fs.readFileSync(photoPath);
  const photoBlob = new Blob([photoBuffer], { type: 'image/jpeg' });

  const formData = new FormData();
  formData.append('name', name);
  formData.append('occasion', config.occasion);
  formData.append('email', config.email);
  formData.append('photo_0', photoBlob, filename);
  formData.append('settings', JSON.stringify({
    model: config.model,
    numResults: config.clips,
    videoLength: config.length,
    aspectRatio: '16:9',
    resolution: '720p',
    taskType: 'image-to-video',
  }));

  const startTime = Date.now();

  try {
    const res = await fetch(`${config.baseUrl}/api/generate`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (res.ok) {
      console.log(`[${index + 1}/${files.length}] ✓ ${filename} → ${data.id} (${elapsed}s)`);
      return { success: true, jobId: data.id, filename };
    } else {
      console.log(`[${index + 1}/${files.length}] ✗ ${filename}: ${data.error} (${elapsed}s)`);
      return { success: false, error: data.error, filename };
    }
  } catch (err) {
    console.log(`[${index + 1}/${files.length}] ✗ ${filename}: ${err.message}`);
    return { success: false, error: err.message, filename };
  }
}

// Process sequentially with delay to respect rate limit
async function processAll() {
  const results = [];

  for (let i = 0; i < files.length; i++) {
    const photoPath = files[i];
    const result = await generateVideo(photoPath, i);
    results.push(result);

    // Delay before next request (except for last one)
    if (i < files.length - 1) {
      process.stdout.write(`   Waiting ${config.delay}s for rate limit...`);
      await new Promise(r => setTimeout(r, config.delay * 1000));
      process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear line
    }
  }

  return results;
}

// Main
console.log('Starting batch generation...\n');
const startTime = Date.now();

const results = await processAll();

const successful = results.filter(r => r.success);
const failed = results.filter(r => !r.success);
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log(`
=== Complete ===
Success: ${successful.length}/${results.length}
Failed:  ${failed.length}
Time:    ${elapsed}s
Videos:  ${successful.length * config.clips} generating
`);

if (successful.length > 0) {
  // Save job IDs for status checking
  const jobsFile = path.join(__dirname, 'batch-jobs.json');
  const jobData = {
    createdAt: new Date().toISOString(),
    config,
    jobs: successful.map(r => ({ jobId: r.jobId, filename: r.filename })),
  };
  fs.writeFileSync(jobsFile, JSON.stringify(jobData, null, 2));
  console.log(`Job IDs saved to: ${jobsFile}`);
  console.log(`\nCheck status with: node scripts/batch-status.mjs`);
}

if (failed.length > 0) {
  console.log('\nFailed files:');
  failed.forEach(f => console.log(`  - ${f.filename}: ${f.error}`));
}
