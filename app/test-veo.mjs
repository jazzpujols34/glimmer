// Test script for Veo API connection
// Run with: node --env-file=.env.local test-veo.mjs [image-path]

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

const project = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

console.log('=== Veo API Test ===');
console.log('Project:', project);
console.log('Location:', location);

if (!project) {
  console.error('ERROR: GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_PROJECT not set');
  process.exit(1);
}

// Initialize client
const ai = new GoogleGenAI({
  vertexai: true,
  project,
  location,
});

// Detect MIME type from buffer
function detectMimeType(buffer) {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  return 'image/jpeg';
}

async function testVeo() {
  try {
    const imagePath = process.argv[2];

    if (imagePath) {
      console.log('\n--- Testing Image-to-Video ---');
      console.log('Image path:', imagePath);

      // Read and encode image
      const imageBuffer = fs.readFileSync(imagePath);
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = detectMimeType(imageBuffer);

      console.log('Image size:', Math.round(imageBuffer.length / 1024), 'KB');
      console.log('MIME type:', mimeType);

      const operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-001',
        prompt: 'Animate this image with subtle, natural movements. Gentle breathing, soft eye movements.',
        image: {
          imageBytes: imageBase64,
          mimeType: mimeType,
        },
        config: {
          aspectRatio: '16:9',
          numberOfVideos: 1,
          durationSeconds: 8,
          personGeneration: 'allow_adult',
        },
      });

      console.log('Operation started:', operation.name);
      console.log('Initial response:', JSON.stringify(operation, null, 2));

      // Poll for completion
      let pollCount = 0;
      const maxPolls = 30;

      while (!operation.done && pollCount < maxPolls) {
        console.log(`Polling... ${pollCount + 1}/${maxPolls}`);
        await new Promise(r => setTimeout(r, 10000));
        pollCount++;

        const updated = await ai.operations.getVideosOperation({ operation });
        Object.assign(operation, updated);

        if (updated.done) {
          console.log('\nOperation completed!');
          console.log('Final response:', JSON.stringify(updated, null, 2));
        }
      }

      // Check response
      if (operation.response?.generatedVideos?.length > 0) {
        const video = operation.response.generatedVideos[0];
        console.log('\n✅ SUCCESS! Video generated');
        if (video.video?.uri) console.log('URI:', video.video.uri);
        if (video.video?.videoBytes) console.log('Video bytes length:', video.video.videoBytes.length);
      } else if (operation.response?.raiMediaFilteredCount > 0) {
        console.log('\n❌ FILTERED by RAI policy:');
        console.log('Count:', operation.response.raiMediaFilteredCount);
        console.log('Reasons:', operation.response.raiMediaFilteredReasons);
      } else if (operation.done) {
        console.log('\n❌ No videos generated');
        console.log('Full response:', JSON.stringify(operation.response, null, 2));
      }

    } else {
      console.log('\n--- Testing Text-to-Video (no image provided) ---');
      console.log('Usage: node --env-file=.env.local test-veo.mjs [image-path]');

      const operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-001',
        prompt: 'A gentle breeze moves through a field of flowers on a sunny day',
        config: {
          aspectRatio: '16:9',
          numberOfVideos: 1,
          durationSeconds: 8,
          personGeneration: 'allow_adult',
        },
      });

      console.log('Operation started:', operation.name);

      let pollCount = 0;
      const maxPolls = 30;

      while (!operation.done && pollCount < maxPolls) {
        console.log(`Polling... ${pollCount + 1}/${maxPolls}`);
        await new Promise(r => setTimeout(r, 10000));
        pollCount++;

        const updated = await ai.operations.getVideosOperation({ operation });
        Object.assign(operation, updated);

        if (updated.done) {
          console.log('\nOperation completed!');
        }
      }

      if (operation.response?.generatedVideos?.length > 0) {
        console.log('\n✅ SUCCESS! Text-to-video works');
      } else {
        console.log('\n❌ No videos generated');
        console.log('Full response:', JSON.stringify(operation.response, null, 2));
      }
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Full error:', error);
  }
}

testVeo();
