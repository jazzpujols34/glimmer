import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prod never ran Next's optimizer (next-on-pages passed images through); keep it off.
  images: { unoptimized: true },
  // nsfwjs runs only in the browser; its ~37 MiB of model weights must not enter the Worker.
  webpack: (config, { isServer }) => {
    if (isServer) config.resolve.alias = { ...config.resolve.alias, nsfwjs: false };
    return config;
  },
  // Polyfill buffer for nsfwjs (client-side NSFW detection)
  turbopack: {
    resolveAlias: {
      'buffer/': 'buffer/',
    },
  },
};

export default nextConfig;
