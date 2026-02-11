import * as Sentry from "@sentry/nextjs";

// Minimal client config - we're only doing server-side error tracking
// This file is required by @sentry/nextjs but we keep it minimal
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Disabled on client - server-side only for now
  enabled: false,

  tracesSampleRate: 0,
});
