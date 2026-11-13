import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendCompletionEmail } from './email';

describe('sendCompletionEmail link', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function sentHtml(id: string): Promise<string> {
    process.env.RESEND_API_KEY = 'test';
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response('{}')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await sendCompletionEmail('a@example.com', id, '阿嬤');
    return JSON.parse(String(fetchMock.mock.calls[0][1].body)).html;
  }

  it('sends a single video to its own page', async () => {
    expect(await sentHtml('job_123_abc')).toContain('/generate/job_123_abc');
  });

  it('sends a batch to the batch page, not the single-video page', async () => {
    const html = await sentHtml('batch_9f1c');
    expect(html).toContain('/batch/batch_9f1c');
    expect(html).not.toContain('/generate/batch_9f1c');
  });
});
