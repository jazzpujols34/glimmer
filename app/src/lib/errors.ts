import * as Sentry from "@sentry/nextjs";

export interface ErrorContext {
  route?: string;
  jobId?: string;
  email?: string;
  provider?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Capture an error with structured context.
 * In production: sends to Sentry with tags and extra data.
 * In development: logs to console with context.
 */
export function captureError(
  error: unknown,
  context: ErrorContext = {}
): void {
  const isError = error instanceof Error;
  const message = isError ? error.message : String(error);

  // Always log to console for debugging
  console.error(`[Error] ${context.route || "unknown"}:`, message, context);

  // In production, send to Sentry
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      // Set tags for filtering in Sentry dashboard
      if (context.route) scope.setTag("route", context.route);
      if (context.provider) scope.setTag("provider", context.provider);

      // Set extra context data
      scope.setExtras(context);

      // Set user context if email provided
      if (context.email) {
        scope.setUser({ email: context.email });
      }

      if (isError) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(message, "error");
      }
    });
  }
}

/**
 * Capture a warning (non-fatal issue).
 */
export function captureWarning(
  message: string,
  context: ErrorContext = {}
): void {
  console.warn(`[Warning] ${context.route || "unknown"}:`, message, context);

  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      if (context.route) scope.setTag("route", context.route);
      if (context.provider) scope.setTag("provider", context.provider);
      scope.setExtras(context);
      Sentry.captureMessage(message, "warning");
    });
  }
}
