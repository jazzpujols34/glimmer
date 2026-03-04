/**
 * Edge-compatible error reporting via Sentry HTTP API.
 * Works on Cloudflare Workers where @sentry/nextjs SDK doesn't.
 */

import { logger } from '@/lib/logger';

export interface ErrorContext {
  route?: string;
  jobId?: string;
  email?: string;
  provider?: string;
  [key: string]: string | number | boolean | undefined;
}

// Parse DSN to get project details
function parseDSN(dsn: string): { publicKey: string; projectId: string; host: string } | null {
  try {
    // DSN format: https://<public_key>@<host>/<project_id>
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace('/', '');
    const host = url.host;
    return { publicKey, projectId, host };
  } catch {
    return null;
  }
}

/**
 * Send error to Sentry via HTTP API (Edge-compatible)
 */
async function sendToSentry(
  level: 'error' | 'warning',
  message: string,
  error: unknown,
  context: ErrorContext
): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const parsed = parseDSN(dsn);
  if (!parsed) return;

  const { publicKey, projectId, host } = parsed;
  const endpoint = `https://${host}/api/${projectId}/store/`;

  const isError = error instanceof Error;
  const stack = isError ? error.stack : undefined;

  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    level,
    platform: 'javascript',
    environment: process.env.NODE_ENV || 'production',
    server_name: 'cloudflare-worker',
    message: { formatted: message },
    tags: {
      route: context.route || 'unknown',
      provider: context.provider,
    },
    extra: context,
    user: context.email ? { email: context.email } : undefined,
    exception: isError ? {
      values: [{
        type: (error as Error).name || 'Error',
        value: message,
        stacktrace: stack ? { frames: parseStackFrames(stack) } : undefined,
      }]
    } : undefined,
  };

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Don't let Sentry errors break the app
    logger.error('Failed to send to Sentry:', e);
  }
}

function parseStackFrames(stack: string): Array<{ filename: string; function: string; lineno?: number }> {
  const lines = stack.split('\n').slice(1);
  return lines.map(line => {
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)/) ||
                  line.match(/at\s+(.+?):(\d+):\d+/);
    if (match) {
      return {
        function: match[1] || '<anonymous>',
        filename: match[2] || '<unknown>',
        lineno: parseInt(match[3], 10) || undefined,
      };
    }
    return { filename: '<unknown>', function: line.trim() };
  }).slice(0, 10); // Limit frames
}

/**
 * Capture an error with structured context.
 * In production: sends to Sentry via HTTP API.
 * In development: logs to console with context.
 */
export function captureError(
  error: unknown,
  context: ErrorContext = {}
): void {
  const isError = error instanceof Error;
  const message = isError ? error.message : String(error);

  // Always log to console for debugging
  logger.error(`[Error] ${context.route || "unknown"}:`, message, context);

  // In production, send to Sentry via HTTP
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    // Fire and forget - don't await to avoid blocking
    sendToSentry('error', message, error, context).catch(() => {});
  }
}

/**
 * Capture a warning (non-fatal issue).
 */
export function captureWarning(
  message: string,
  context: ErrorContext = {}
): void {
  logger.warn(`[Warning] ${context.route || "unknown"}:`, message, context);

  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    sendToSentry('warning', message, null, context).catch(() => {});
  }
}
