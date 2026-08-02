import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ORIGINAL_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))));
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = ORIGINAL_TOKEN;
  if (ORIGINAL_CHAT_ID === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID;
  else process.env.TELEGRAM_ADMIN_CHAT_ID = ORIGINAL_CHAT_ID;
  vi.unstubAllGlobals();
});

describe('sendAdminAlert', () => {
  it('is a silent no-op when TELEGRAM_BOT_TOKEN is unset', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_ADMIN_CHAT_ID = '12345';
    const { sendAdminAlert } = await import('./telegram');
    await sendAdminAlert('test');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is a silent no-op when TELEGRAM_ADMIN_CHAT_ID is unset', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;
    const { sendAdminAlert } = await import('./telegram');
    await sendAdminAlert('test');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts to the Telegram sendMessage endpoint with the bot token and chat id when both are set', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '12345';
    const { sendAdminAlert } = await import('./telegram');
    await sendAdminAlert('拾光收款 NT$299（20次）a@x.com');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botbot-token/sendMessage');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ chat_id: '12345', text: '拾光收款 NT$299（20次）a@x.com' });
  });

  it('never throws when the fetch call rejects', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '12345';
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
    const { sendAdminAlert } = await import('./telegram');
    await expect(sendAdminAlert('test')).resolves.toBeUndefined();
  });
});
