export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isValidEmail } from '@/lib/validation';
import { isEmailVerified, isAdmin } from '@/lib/credits';
import { errors } from '@/lib/api-response';
import { enforceIdentity } from '@/lib/identity';

// Whisper's own hard upload limit — reject before spending a single API call
// on a file that would be rejected anyway (or worse, one that streams a huge
// upload through our edge function first).
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * POST /api/transcribe
 * Accepts an audio/video blob and returns timestamped subtitle segments.
 * Uses OpenAI Whisper API (metered, billed to us) for speech-to-text.
 * Requires a verified caller email — no credit charge, just identity, since
 * this is the only route that spends money on an external API with no caller
 * identity check at all.
 */
export async function POST(request: Request) {
  try {
    // Rate limit: 20 transcription requests per 5 minutes per IP
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`transcribe:${ip}`, 20, 300);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return NextResponse.json(
        { error: '請求過於頻繁，請稍後再試' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Config problem on our side, not the user's — don't show them an env var
      // name and a .env.local instruction. Surface it to Sentry so it's fixable.
      captureError(new Error('OPENAI_API_KEY is not set — auto-subtitle disabled'), {
        route: '/api/transcribe',
      });
      return NextResponse.json(
        { error: '自動字幕功能暫時無法使用，請稍後再試或手動輸入字幕。' },
        { status: 503 }
      );
    }

    const formData = await request.formData();

    const email = formData.get('email') as string | null;
    if (!email || !isValidEmail(email)) {
      return errors.invalidEmail();
    }

    // --- Phase 2b enforcement (dormant unless REQUIRE_SESSION_FOR_PAID=true) ---
    const identity = await enforceIdentity(request, email);
    if ('error' in identity) {
      return errors.sessionRequired();
    }
    const actingEmail = identity.email;

    if (!isAdmin(actingEmail) && !(await isEmailVerified(actingEmail))) {
      return errors.emailNotVerified();
    }

    // Rate limit: 10 transcription requests per 5 minutes per email — caps a
    // single verified identity's spend on this metered API independent of IP.
    const emailRateCheck = await checkRateLimit(`transcribe:email:${actingEmail.toLowerCase().trim()}`, 10, 300);
    if (!emailRateCheck.allowed) {
      const retryAfter = Math.max(1, emailRateCheck.resetAt - Math.floor(Date.now() / 1000));
      return NextResponse.json(
        { error: '請求過於頻繁，請稍後再試' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const audioFile = formData.get('audio');
    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: '缺少音訊檔案' }, { status: 400 });
    }

    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: '音檔過大，請上傳 25MB 以下的檔案' },
        { status: 413 }
      );
    }

    // Call Whisper API with verbose_json to get word-level timestamps
    const whisperForm = new FormData();
    whisperForm.append('file', audioFile, 'audio.mp4');
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('response_format', 'verbose_json');
    whisperForm.append('timestamp_granularities[]', 'segment');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      logger.error('Whisper API error:', err);
      return NextResponse.json(
        { error: `語音轉文字失敗 (${whisperRes.status})` },
        { status: 502 }
      );
    }

    const result = await whisperRes.json();

    // Map Whisper segments to our subtitle format
    const segments = (result.segments || []).map(
      (seg: { text: string; start: number; end: number }) => ({
        text: seg.text.trim(),
        startTime: seg.start,
        endTime: seg.end,
      })
    );

    return NextResponse.json({ segments });
  } catch (error) {
    captureError(error, { route: '/api/transcribe' });
    return NextResponse.json({ error: '語音轉文字處理失敗' }, { status: 500 });
  }
}
