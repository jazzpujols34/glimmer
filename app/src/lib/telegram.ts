/**
 * Best-effort Telegram alert to the solo founder's private admin chat.
 * Silent no-op when either env var is unset — never blocks a caller and
 * never throws. Plain fetch, edge-safe (no SDK).
 */

import { captureError } from './errors';

/** Post a text message to the admin's Telegram chat. Fire-and-forget-safe: never throws. */
export async function sendAdminAlert(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (error) {
    captureError(error, { route: 'telegram.sendAdminAlert' });
  }
}
