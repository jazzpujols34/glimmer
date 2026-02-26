import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Polyfill buffer for nsfwjs (client-side NSFW detection)
  turbopack: {
    resolveAlias: {
      'buffer/': 'buffer/',
    },
  },
};

export default nextConfig;
