/**
 * Email sending utility using Resend REST API.
 * Edge-compatible: uses fetch(), no SDK needed.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = '拾光 Glimmer <noreply@glimmer.video>';
const FROM_EMAIL_FALLBACK = 'onboarding@resend.dev'; // Resend sandbox

export async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[Email] RESEND_API_KEY not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://glimmer.video';
  const verifyUrl = `${appUrl}/api/verify/confirm?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  // Use sandbox sender if no custom domain configured
  const from = process.env.RESEND_FROM_EMAIL || FROM_EMAIL_FALLBACK;

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: '拾光 Glimmer — 驗證您的 Email',
      html: buildVerificationHtml(verifyUrl),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Email] Resend API error:', err);
    return { success: false, error: 'Failed to send email' };
  }

  return { success: true };
}

/**
 * Send a notification email when video generation is complete.
 */
export async function sendCompletionEmail(
  email: string,
  jobId: string,
  name: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[Email] RESEND_API_KEY not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://glimmer.video';
  const viewUrl = `${appUrl}/generate/${encodeURIComponent(jobId)}`;
  const from = process.env.RESEND_FROM_EMAIL || FROM_EMAIL_FALLBACK;

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `拾光 Glimmer — 您的影片已完成！`,
      html: buildCompletionHtml(viewUrl, name),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Email] Completion email error:', err);
    return { success: false, error: 'Failed to send completion email' };
  }

  return { success: true };
}

function buildCompletionHtml(viewUrl: string, name: string): string {
  return `
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 24px; font-weight: bold; margin: 0;">拾光 <span style="color: #6366f1;">Glimmer</span></h1>
    <p style="color: #666; font-size: 14px; margin-top: 4px;">AI 回憶影片服務</p>
  </div>

  <p style="font-size: 16px; line-height: 1.6;">您好，</p>
  <p style="font-size: 16px; line-height: 1.6;">
    您為 <strong>${name}</strong> 製作的回憶影片已經完成！請點擊下方按鈕觀看影片。
  </p>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${viewUrl}" style="display: inline-block; background: #6366f1; color: #fff; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none;">
      觀看影片
    </a>
  </div>

  <p style="font-size: 13px; color: #888; line-height: 1.5;">
    Your memorial video for <strong>${name}</strong> is ready! Click the button above to view it.
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />

  <p style="font-size: 12px; color: #aaa; line-height: 1.5;">
    此信件由拾光 Glimmer 自動發送。如有任何問題，請聯繫 glimmer.hello@gmail.com。<br />
    This email was sent automatically by Glimmer. For questions, contact glimmer.hello@gmail.com.
  </p>
</body>
</html>`.trim();
}

function buildVerificationHtml(verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 24px; font-weight: bold; margin: 0;">拾光 <span style="color: #6366f1;">Glimmer</span></h1>
    <p style="color: #666; font-size: 14px; margin-top: 4px;">AI 回憶影片服務</p>
  </div>

  <p style="font-size: 16px; line-height: 1.6;">您好，</p>
  <p style="font-size: 16px; line-height: 1.6;">
    請點擊下方按鈕驗證您的 Email 地址，以開始使用拾光的免費影片額度。
  </p>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${verifyUrl}" style="display: inline-block; background: #6366f1; color: #fff; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none;">
      驗證 Email
    </a>
  </div>

  <p style="font-size: 13px; color: #888; line-height: 1.5;">
    Click the button above to verify your email and unlock your free video credit.
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />

  <p style="font-size: 12px; color: #aaa; line-height: 1.5;">
    此連結將在 15 分鐘後失效。如果您沒有在拾光註冊，請忽略此信件。<br />
    This link expires in 15 minutes. If you didn't sign up for Glimmer, please ignore this email.
  </p>
</body>
</html>`.trim();
}
