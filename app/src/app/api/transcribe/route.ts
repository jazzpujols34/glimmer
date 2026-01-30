export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

/**
 * POST /api/transcribe
 * Accepts an audio/video blob and returns timestamped subtitle segments.
 * Uses OpenAI Whisper API for speech-to-text.
 */
export async function POST(request: Request) {
  try {
    // Rate limit: 10 transcription requests per minute per IP
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`transcribe:${ip}`, 10, 60);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: '請求過於頻繁，請稍後再試' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.resetAt - Math.floor(Date.now() / 1000)) } }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY 未設定。請在 .env.local 中加入此金鑰。' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio');
    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: '缺少音訊檔案' }, { status: 400 });
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
      console.error('Whisper API error:', err);
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
    console.error('Transcribe error:', error);
    return NextResponse.json({ error: '語音轉文字處理失敗' }, { status: 500 });
  }
}
