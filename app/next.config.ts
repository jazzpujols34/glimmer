import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // Suppress source map upload warnings in CI
  silent: true,

  // Don't upload source maps (we're just doing error capture)
  sourcemaps: {
    disable: true,
  },

  // Disable Sentry telemetry
  telemetry: false,
});
