import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Only send errors in production
  enabled: process.env.NODE_ENV === "production",

  // Set tracesSampleRate to 0 since we're only doing error tracking
  tracesSampleRate: 0,

  // Don't send PII by default
  sendDefaultPii: false,

  // Environment tag
  environment: process.env.NODE_ENV,
});
